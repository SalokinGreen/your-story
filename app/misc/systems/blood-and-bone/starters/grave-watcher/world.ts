/**
 * Grave Watcher: the world notes (docs/bb-starters-design.md section 3,
 * decisions 163-172). Original text (decision 3): the town, the yard and the
 * Watch are this project's own. Slice of life first; the yard is the weather
 * of the place.
 */
import type { StoryLore } from "../../../../structs";
import { starterNote } from "../shared";

const RUNNING_IT = `# Grave Watcher — Running it

A season in Hollins Ferry, a valley town beside the Long Acre, a graveyard two hundred thousand graves wide. Slice of life first: a small-town life sim with a graveyard at the end of the road. The talk is quick, warm and funny, and everyone knows everyone's business. The yard is real and dangerous, but it is the weather of the place, not the plot of every scene. If there is no Campaign Plan note yet, read the secrets "Grave Watcher — The season" (the outline) and "Grave Watcher — The truth of the season's working", write one (medium spine, seven beats, each laid over the town calendar) and call start_game after the setup card.

Rhythm. A day is town: errands, a second job (the Watch pays badly), lunch at the Lamplight, a favour, an argument, a meeting. A night is a watch: a check-in every hour after dark, mostly gossip, jokes, song requests and someone's dog; a logbook line; now and then a call that means going down the ladder. Most nights nothing comes up and the radio talk is the scene. One town event every week or two ("The town calendar"): a social scene first, a yard problem second, sometimes. Never two yard crises in a row. Unrest moves with the campaign beats, not with each night.

Town first. Play the regulars (the NPCs; "Town regulars") as people with a running bit and a want. Bring Connections into scenes often, and give each Watcher a life in town worth losing. Compel, Gather Information and Secure an Advantage do most of the work (winning the argument at the meeting, finding who sent the pie, getting the booth). A good conversation can raise a Connection a rank; a bad one drops it. Stress comes from life too (a fight with your mother counts). Face Danger and the Skirmish moves are for the nights that go wrong. Offer Repair a Bond whenever a day was mostly town.

Masquerade off. The Concord, the Vigil and the Masquerade do not exist here; the Board of Wardens runs the Watch. The core's table list and the Europe sections do not apply: use this story's own tables (names are in "Town regulars" and the visitors notes). Reread three things. Exposure is not used (leave it at 0): Taint takes its place, and any cost an ability pays in Exposure is paid in Taint instead (the Apostate's marks, for one). The Mask Slips becomes The Dark Takes Hold: Taint +1. Heat does not exist here: Unrest (already in Meters & tracks) is the world meter, so do NOT create the City set at setup. The end-of-session reminder's Heat line does not apply: Unrest moves only by the rule below. Clean Up becomes cleansing (salt, running water, a night in town): Taint -1, once a session. Taint +1, once a scene each, for: a miss that touches a working (any roll against, near or about the green light, the Tally or another working, whatever the miss table says); staying in the yard past dawn; a grave opened by your hand; a Power used in the yard on a miss. Taint 3 the dogs in town will not come near you; 5 the dead start talking to you by name; 6 the yard keeps you. Unrest (world, starts 1): 3 the dead walk on ordinary nights; 4 the county inspector threatens to bring in the Board; 5 the town is in danger; 6 the yard breaks its fences. It rises when a working is left to grow, a grave is robbed or a tower is abandoned; it falls when a working is broken or a section laid quiet.

Setup for each Watcher: manage_meter create_set "Blood & Bone character" (owner = their name; ignore its Exposure), plus "Witch" for a Witch/Warlock, then manage_meter create with owner their name, meter "Taint", min 0, max 6, value 0, thresholds [{at 3, label "The dogs know", note "Dogs in town will not come near them."}, {at 5, label "Named", note "The dead start talking to them by name."}, {at 6, label "The yard keeps you", note "Take them out of the yard now, or the yard keeps them."}]. Then manage_track create their Vow. Tell a player once: the Watch pays badly, so everyone has a second job. Voice: short lines, warm teasing, a running bit per regular; someone always interrupts; end scenes on a small human beat (a thermos handed up the ladder). Dee Harjo has her own booth at the Lamplight.

The team. Players crew Tower Nine, their headquarters. A roster Watcher a player picks is reassigned to Nine; their old tower gets a relief voice on the radio. The roster Watchers nobody picked are NPCs in Towers One to Eight; with one or two players, fill the team to three or four counting them, and let those NPCs drop by Nine on off-nights. Play them from "The roster". A player who joins later takes over a sheet from it. Couch and party: each player picks a Watcher (ask_question, target_player_name) or builds their own.

Read when needed: "The town calendar" every week; "Hollins Ferry" and "Town regulars" for any scene in town; "The Watch net" for any radio scene; "The Long Acre" before a section is entered; the tables when you need a face, a rumour or a call. Connections are the heart: let a Connection ask for something.`;

const SEASON_PUBLIC = `# Grave Watcher — This season

One season, late September to early May (about thirty-two weeks), in the life of Tower Nine. Mostly town: the calendar sets the pace ("The town calendar"), and a week is a few errands, a meeting, a watch or two. Underneath, the yard is restless. A green light keeps turning up among the graves, Tower Six went quiet last spring, and a newcomer in town has more money than he should. Unrest starts at 1 and moves with what the Watch does.

Two tracks run all season: "Get through the season" (mark it as the calendar passes and as the Watchers show up for the town) and "Name the dead of the Old Lot" (mark it when a name is found, spoken and written down). The season ends on Ferry Day in early May, and what the town does that day is the ending.`;

const SEASON = `# Grave Watcher — The season

The campaign outline (GM only): one season (about thirty-two weeks, late September to early May) in the life of Tower Nine. Mostly town. Underneath, slowly, a working is growing in the Long Acre, the tower that went quiet last spring is not finished with the Watch, and someone in town is making money from a restless yard. A green light keeps showing in the Long Acre (the Tally's keeper looking for a name). It surfaces through town life: the funeral director's new colleague and his cash, the Founders' Day speech that mentions the Old Lot, the dog that will not pass the Lamplight's back door. The radio is the second place it shows. Read the secrets before you write the plan. Unrest starts at 1; the plan raises it a step per beat at most, and the players can hold it back.

The seven beats (each between the events named; see "The town calendar"):

1. The Quiet Week (Founders' Day to the pumpkin weigh-in). Settle in. Walt signs the Watchers up for things. Teddy Vance is the new man at Greaves & Sons and paid cash for the Hendricks place. Tower Six has a dead channel; June calls it "radio trouble". The first green light moves among the Catholic Rise graves. Hooks to plant: June's shelf with Six's mug; Eli's tape; Cora Pruitt gone vague about last year's Halloween committee notes; Wendell Boone on his bench at the words Old Lot. Goal: make them love the town.
2. First Graves (the Lantern Walk to the dance marathon). Digging is heard at the Old Lot fence; a grave is found open and empty-looking but not empty. The Hendricks place has lights at 3 a.m. Bea Lindqvist mentions that the records of the Old Lot were never filed. Unrest 1 to 2.
3. The Count (the Halloween committee to All Souls). Names begin to surface: a blank headstone carrying a name by morning, a name said on the radio, a child's chalk on the gate. The November mourners come. A voice on Six's dead channel says all quiet, every night at 2:11.
4. Who Profits (Thanksgiving to the Christmas pageant). Teddy's hearse is seen on the ferry road. Owen Lister arrives from the Board for a routine inspection and is, unfortunately, charming. Unrest 3: the dead walk on ordinary nights; Pastor Hal asks the Watch for a vigil. A Watcher is offered something to look away.
5. The Hard Winter (the winter carnival to the Sweetheart Supper). The Drowned Ground freezes and the lights under the ice show. Emmett Roake of Tower Six tells his side of last spring. Lyle Greaves confesses what his father told him. The Board talks of condemning the yard. Unrest 4.
6. The Thaw (the budget meeting to the spring cleanup). Mud season opens the ground. A reckoning at the Hendricks cellar and the Old Lot; the buyer behind Teddy is named; Lister has to choose. The count passes fifty. Unrest 5 unless the players have pushed back.
7. Ferry Day (the anniversary, early May). The count reaches the last name. What the town does that day is the ending: see the secret. Afterwards, one scene of an ordinary morning at the Lamplight, whatever happened.

Tracks (seeded at setup): "Get through the season" (Watch, a Formidable vow): mark it as the calendar passes and as the Watchers show up for the town; "Name the dead of the Old Lot" (Watch, Extreme): mark it when a name is found, spoken and written down.

Who profits. Teddy Vance is not the villain of the piece; he is a nervous man with a debt. His employer is not in town (an out-of-county buyer; the secret says who). Owen Lister is honest and wants the Watch to look good; he is the one who can turn the Board either way. Give the players ways to find each fact more than one way: Marisol's gossip, June's logs, Bea's records, Eli Sandoval's radio logs, Wendell Boone's bench.`;

const CALENDAR = `# Grave Watcher — The town calendar

A season of events, one every week or two. Each is a social scene first (who runs it, who is feuding, who needs a volunteer). Trouble in the yard is optional. Weeks run Saturday to Friday, counted from Founders' Day (W1 starts that Saturday; Halloween falls in W5, May 4 in W32).

W1 Founders' Day pancake breakfast, last Saturday of September, on Main Street. Cora Pruitt runs it, Walt gives the speech (it always includes the Old Lot, in a sentence nobody listens to). The Watchers are signed up for the pie table. Yard: nothing, on purpose. A fine day to meet everyone.
W2 The pumpkin weigh-in, in the Brandt Hardware lot. Gus and Arlo Brandt weigh on opposite scales. Sheriff Okafor is the judge. Yard: Tommy Reyes hears something on the Hill.
W3 The Lantern Walk, mid-October. The town walks lanterns up the Catholic Rise at dusk and back. Pastor Hal leads, Sister Agnes sings from the dark. Yard: the walk goes into the yard; one lantern too many comes down.
W4 The dance marathon, twenty-four hours at Celeste Marchetti's studio above the bank, for the fire department's new truck. Couples drop; gossip peaks. Yard: a Watcher cannot be there at 3 a.m. and on the tower; who is covering?
W5 The Halloween committee meeting, on the Monday: the committee always leaves it to the last week. A sore subject: last year's haunted hayride went through the yard's fence. Walt wants a motion, Cora wants a vote, the Watch wants a veto. Yard: no.
W5 Halloween night, on the Friday. Everyone in costume, every Watcher on a tower or at the candy table. The dead like it too. Yard: busiest night of the autumn; most of it harmless.
W6 All Souls week, early November. The November mourners come, plus the stranger who leaves flowers on a grave with no name. The Lamplight puts out the long table. Yard: the Old Lot, a name.
W9 Thanksgiving potluck at St. Bride's. Pearl Whitlock brings the stuffing and a grudge. Hal's sermon runs long. Yard: a quiet watch on a loud night.
W11 The first snow supper, early December. When the first snow falls Marisol opens the Lamplight free for chowder. Whoever is on tower misses it, and gets a thermos. Yard: footprints in the first snow where nobody walked.
W13 Tree lighting and the Christmas pageant, at the chapel. The angels are Fiona's loud family. Yard: the choir hears a second choir.
W14 New Year's Eve at the Low Water. Hank Delgado's one night with a cover charge. The Watch drinks free until eleven. Yard: a resolution, and a break in the fence at midnight.
W18 The winter carnival, late January: ice fishing on the reservoir, a chili cook-off, a sledding hill (the Children's Hill is off limits). Yard: the Drowned Ground freezes; the lights beneath.
W21 The Sweetheart Supper, in the church hall, mid-February. Matchmaking is a contact sport. Yard: someone has left a note on a grave addressed to a Watcher.
W24 The town budget meeting, March. Two hours on the parking item. Lister is in the back with a clipboard. Yard: the Board's numbers, and Tower Six's budget line.
W26 The thaw, late March. Mud season, the road to the Rise washed out, the Drowned Ground rising. Rocco tows everyone. Yard: the ground gives up what it held.
W29 The spring cleanup of the graves, mid-April. Volunteers in the yard with rakes; Wendell Boone supervises from a lawn chair. Yard: the best cover for a dig, and the best chance to see one.
W31 The historical society's Ferry Day exhibit, at the library. Bea Lindqvist's annual display of what the town has agreed to remember. Yard: nobody asks why the 1911 case is empty.
W32 Ferry Day, May 4. Not a holiday. The old people light a candle; the town has forgotten why. Yard: the last night of the count.

Between them: Sunday service, the Thursday fish fry, the library's story hour, the Tuesday night poker at Brandt Hardware, the bake sale for whatever is broken. Use the weekly shapes to fill a quiet week.`;

const LONG_ACRE = `# Grave Watcher — The Long Acre

The yard: two hundred years of graves over a valley and its ridges, the biggest in three counties, with a fence the Watch walks and nine towers on its high ground. Fog sits in it. Burials are still done (Greaves & Sons, mornings). It draws dark magic as a low field draws water: enough grief and old burial. Rules of the place are written on the inside of tower doors; follow them or find out why.

Sections and their rules:
- The Paupers' Field (south, flat, ten thousand graves, wooden markers long gone). Never lift a marker; the field minds who disturbs the nameless. Taint +1 if you take anything out.
- The Catholic Rise (east ridge, stone, the oldest saints' statues). The statues are fine. Do not count them. If you reach a number, stop and leave by the way you came.
- The Children's Hill (north, small stones, toys left on them). Never answer a voice on the Hill, even a familiar one; say "the Watch is here" and nothing else. Tommy Reyes thinks this is a joke.
- The Drowned Ground (west, by the reservoir, built over the old low town in 1958). Leave salt at the gate on the way in and out. The water gives back what it kept when it is cold enough.
- The Old Lot (north-east, an overgrown field behind the old ferry road, a rusted fence). No records at all. It is quiet. That is the problem. No Watcher has patrolled it in a decade; the fence is always a little further in than it was.
- The Founders' Plot (centre, iron fence, the town's first families). Everyone's grandmother is in it. Wreaths on holidays. A good place for a conversation with Pearl Whitlock, who visits her three husbands here every Sunday.
- The Chapel (hillside, a stone chapel with a bell on a wire, the yard's own, shut). Bell wires run from it to every tower; if it rings on its own the Watch is called.
- The Service Road: a gravel loop that the tower trucks use, mud-bound in the thaw.

Keeping the yard: patrol on foot at dusk and dawn; log what you saw; carry salt, iron nails, a ward-lamp, a radio. A fence breach is a rating one on the Board's form. Dawn ends most things in the yard. Past dawn in the yard is Taint.

Burials. Fresh graves in the Rise and the Hill are the biggest worry; ground that's been dug is thin. Greaves & Sons dig in the morning with a backhoe and Wendell Boone's advice. A funeral is a town event: the whole street comes.

Lights, bells, voices: the yard's three signs. A light walking between graves is looking for a name. A bell is a call to the Watch. A voice is not yours to answer. The yard is not evil: it is a field of grief with a long memory. Treat it as you would a very old, very sad neighbour with a temper.`;

const TOWER_NINE = `# Grave Watcher — Tower Nine

Your tower, your headquarters, on the high ground between the Catholic Rise and the Paupers' Field. One room on stilts above the pines, forty steps up a ladder with a trapdoor. Warm because of the stove, drafty because of everything else. The Watchers can sleep there, and most nights do not.

What is in it, so the GM can use it:
- The bunk (two, stacked), a wool blanket that smells of woodsmoke, a thermos that never stays hot.
- The stove (a little iron one; it goes out at the worst moment; it has a name).
- The radio set: a squat tube set, Eli Sandoval's rebuild, call sign Nine; a hand mic on a curly cord; the dial with a taped mark for the net.
- The logbook: a green ledger, one line per hour after dark; the previous crews' entries go back to the 1970s. Reading it is a way to learn the yard.
- The spotting scope, brass, on a swivel at the south window.
- The fire-finder plotting table with the yard's map under glass; pins for each tower; grease-pencil marks for last night's lights.
- The ward-lamps on the rail: six lamps, hurricane style, burning salt-and-sage oil. When one gutters, something is near.
- Salt (a sack), iron nails (a coffee can), a shotgun with rock salt (locked), first-aid kit, spare batteries.
- The door, with its rules for the sections written in the last crew's hand and one added in a different hand: "Be kind to June."
- A shelf with three paperbacks, a chess set with a missing bishop, a jar of coins for the radio fund, and Dee Harjo's spare reading glasses that have been there for years.
- A window box on the north sill. Someone before you grew basil. It is still alive, out of spite.

Use them: a lamp gutters, the scope shows a light, the logbook has an entry in handwriting nobody recognises. The tower is a home. Let the Watchers decorate it. Let town visit: Tommy Reyes brings pie; Marisol sends a thermos; Fiona sends a bag of rolls.`;

const TOWN = `# Grave Watcher — Hollins Ferry

Hollins Ferry: a valley town of about three thousand on a bend of the river, below the Long Acre. The sign at the edge says POP. 3,112 and someone has added in marker "(and the others)". The ferry itself is gone; its landing is a fishing spot. Main Street runs down the hill from the yard gate to the old ferry road, three blocks of brick. Everyone knows everyone's business; the mail is gossip with a stamp.

Places (see "Town regulars" for who is in each):
- The Lamplight: the diner. Booths, a counter, a chalkboard, no Wi-Fi (Marisol Ochoa refuses). Open from five a.m. to ten p.m., closed Mondays. Booth nine is kept for Watchers. The place to learn things.
- The Low Water: the bar. Hank Delgado's. Dark wood, a jukebox that skips, a dartboard with a history. The Watch drinks free on its first night off.
- Brandt Hardware: half of it is Gus's side, half Arlo's, painted two shades of green with a chalk line between. Salt by the sack, nails, lanterns. Wendell Boone's bench is outside.
- The Ferry Motel: eleven rooms and a neon sign with a missing R. Nell Fairweather runs it. Visitors stay here, and Nell tells the town about them by breakfast.
- Greaves & Sons: the funeral home, a white house with a green door on Chapel Street. Lyle Greaves, forty years in, retiring. Teddy Vance is the new man.
- St. Bride's: the chapel, wooden, with a long hall for suppers. Pastor Hal Brewer. Sister Agnes sings on Sundays from a corner nobody sits in.
- The sheriff's office: two cells, one coffee machine, a wall of paperwork about the yard. Sheriff Ruth Okafor.
- The pharmacy: night shift for the town's Vampire; a counter, a back room, a fridge for the blood-donor drive. Desmond Hale.
- The bakery: the Gale family's, loud before dawn, quiet at the moon.
- The library and historical society: one room, one librarian, every record. Bea Lindqvist.
- The gas station and tow: Rocco Tanaka; one pump leaks.
- The dance studio, above the bank: Celeste Marchetti; a sprung floor and a view of Main Street.
- The apothecary and flower shop: Ingrid Moss; herbs, candles, salt in pretty jars.
- The town hall: Walt Pruitt's war room; a gavel, a map of the parking, the meeting hall where Cora Pruitt's committees sit. June's dispatch room is upstairs.
- The clinic on Elm: Dr. Imani Price's practice. Living patients by day; the rest by appointment after dark, through the side door.
- The Hendricks place: a big house on the ferry road that backs onto the Old Lot's fence. Empty for years. Teddy Vance bought it for cash.
- The Dispatcher's office: June Abernathy's room over the town hall, with the base radio. She hears everything first.
- The ferry landing: the fishing spot, a plaque, the old pilings.

How the town treats the Watch. They are neighbours with a hard job. Free coffee, favours, opinions. The Watch is respected and teased in equal measure. A Watcher who skips Founders' Day hears about it until Easter.

Gossip economy. The fastest line is Nell to Marisol to June to the net. Whatever a Watcher says in the Lamplight is known at the Low Water by dinner. A secret told to Wendell Boone is safe: he forgets it by Thursday. Use gossip as the way information moves.`;

const WATCH_NET = `# Grave Watcher — The Watch net

Nine towers and a dispatcher in town. The net is the yard's nervous system and the town's party line.

The towers (call sign, section watched, usual voice; see "The roster" for who):
- One: the Founders' Plot and the main gate. Steady, fog-reading.
- Two: the Catholic Rise. The veteran. Reads the weather like a nature documentary.
- Three: the Drowned Ground. The reservoir side. Quiet, wet, kind.
- Four: the east fence line. The chatty one. Bram Gale runs the fence line on full moons.
- Five: the Paupers' Field. The Ghost who stayed.
- Six: the Old Lot side. Went quiet last spring (see below).
- Seven: the Children's Hill. The rookie, on their first season.
- Eight: the oldest tower, the north ridge. Stone voice, few words.
- Nine: the players. Headquarters, spare radio, the logbook.
- Dispatch (June Abernathy), in town: the base set above the town hall. She logs, relays, and knows everything first. Eli Sandoval keeps the repeater alive.

Etiquette. Call sign first: "Nine, this is Four." "Go ahead, Four." Say again; copy; break, break (emergency). Check-in every hour after dark by tower number; the net goes in order. Silence on your hour is noted: after ten minutes June calls the nearest tower. After twenty, the nearest Watcher goes. Use real words; no names of the dead on the air (they hear). Songs on request after midnight, if June has the tape. Do not talk over June.

What a dead channel means. A tower that does not answer is: asleep (most often), broken (the set), or taken. A channel with a faint breathing click, or a voice that checks in as normal when no one is there, is the yard answering. Never reply to a check-in you are sure nobody sent.

Tower Six. The Old Lot side. Last spring the crew of Six, Ines Calloway and Pell Garrity, stopped checking in. The Board called it radio failure; the tower was written up for decommission and never was. Since autumn the post has a new Watcher (see the roster) who says almost nothing: two clicks of the mic when asked. On bad nights, at 2:11 a.m., the channel says "Six, all quiet" in a voice that is not the Watcher on it. The net does not mention it; June changes the subject, and Tower Six's old mug stays washed on her shelf. Eli Sandoval still has the last transmission on tape and hears it in his sleep. It is the quietest thing on the radio and the loudest.

Logs. Each tower keeps a ledger; the dispatcher keeps the master; Eli Sandoval keeps recordings on tape of every night for the county. A way to find out: ask Eli.`;

const WORLD = `# Grave Watcher — The world

The supernatural is ordinary here. Everyone knows the dead do not all stay down and that some of the living are not exactly human. It is on the town form.

Living openly. Kinds in Hollins Ferry have a night-shift card from the county. A Vampire (Desmond Hale) works nights at the pharmacy and eats through the donors' drive (a Thursday arrangement, a fridge, a polite sign). Werewolves keep the full moon in two ways: Fiona Gale's family shelter in the bakery cellar and are back at the ovens by six, while Bram Gale, the pack's runner, patrols the east fence line outside the yard with the Watch's blessing. A Ghost sings in the chapel and has asked the town meeting for a vote (denied, then argued over). Gargoyles are listed as historic structures. A Witch runs the apothecary. Hunters are called wardens here and are licensed. Nobody finds it strange; people do find it rude when you stare.

What is not ordinary. Yards. A great old cemetery draws dark magic: enough grief and old burial makes a place a low field the dark pools in. Workings take root. Graves open. Things come up that were never buried. That is why there are towers, a net and a Watch. The county takes it seriously and pays slowly.

The Board of Wardens. The county body that runs the Watch and writes its rules: forms, inspections, budgets, the monthly Board letter. Its inspector, Owen Lister, drives up in a county car and stays at the Ferry Motel. The Board's measure of a yard is Unrest. A failing yard is condemned: the graves moved, the land sold. Nobody in Hollins Ferry wants that, which is why everyone looks the other way when paperwork slips.

How people make a living. Most Watchers have a second job (the Watch pays badly): a shift at the Lamplight, repairs at Rocco's, hours at the library. The Board pays a stipend and a lantern allowance. Tower Nine's funds are the coin jar.

The lives of the dead. A Ghost is a resident with an address; a Revenant is a person with a mission; none are strangers. The unquiet are the exception, and a yard is where the exception lives.

Money, phones, cars. Today, analogue-leaning: radios, logbooks, bad signal in the valley, a landline in every kitchen, pickup trucks. The net is the Watch's, not the town's.`;

const SECRET_TALLY = `The truth of the season's working

The Tally. On the fourth of May, 1911, the excursion steamer Annabel Hollins, overloaded for the Hollins Ferry & Navigation Company's spring picnic, went down at the landing. Sixty-three died. The company's owner, Josiah Hollins, paid the sexton and undertaker, Amos Greaves, to bury them that night in the field above the landing with no records, to escape the lawsuits. That field is the Old Lot. A widow among the dead's families, Hester Quill, a Witch who lost two daughters, laid a counting on the ground: it would count the unrecorded until every one was named aloud. It slept for 114 years.

It woke because Teddy Vance started digging. The cash that bought the Hendricks place is Ashcombe's advance, carried in a Greaves & Sons deposit bag. He is working for an out-of-county buyer, Ashcombe Holdings, who wants the company strongbox that Amos Greaves buried with the Hollins ledger: it holds the original deed to the whole waterfront and the passenger list. Teddy took the job at Greaves & Sons for access to the Greaves family's old files, and bought the Hendricks place for a base. He digs by night with two hired hands and a small backhoe he calls landscaping. He thinks the only danger is getting caught. Each grave he opens answers the Tally: one name surfaces (a blank headstone, a whisper, a child's chalk). He is picking up Taint. The green light in the yard is Hester's lantern: it walks the graves looking for the next name and goes out when one is found.

The small hooks. Wendell Boone dug in the Old Lot once, as a young man, and found rows of small bones with ferry tags and an iron box under a plain stone; he filled it in and never spoke of it. Cora Pruitt is hiding last Halloween's committee notes: the minutes record that the hayride crossed the Old Lot fence, that Walt signed the permit, and that the fence had been moved in forty feet. She hides them to protect Walt, and because the minutes mention the Old Lot. In public she is only evasive.

How it ends. At sixty-three names the dead rise and walk home, to the houses on Main Street they were going to (the old picnic route), and ask for supper. They are not hostile. The yard's fence breaks around them. Three honest endings:
- Name them: every name written into the town record (Bea Lindqvist's registry and Hal's chapel book), spoken aloud, on Ferry Day. The Tally closes. The cost: the town has to admit it, and Lyle Greaves has to testify.
- Feed them: Ferry Day as a supper, the whole town at the long table, sixty-three places. It works for a night; the working does not close and next year there is a supper again. A tradition is born.
- Break it: Ingrid Moss can unmake the working with a cold rite, and the dead are scattered unnamed. Unrest drops. Hester's counting gets one last name: someone who did it.

Teddy: nervous, in debt, decent underneath; he can be turned. What the town sees: a polite man with cash, a clean car and an interest in the old sections. He pays for his work out of the Ashcombe advance in the deposit bag, and the strongbox is what he wants from the Old Lot. Owen Lister: honest; when the Board hears of Ashcombe he will fight. Lyle Greaves: carries his father's confession and the key to the strongbox. The strongbox: in the Old Lot beneath the sexton's own plain stone ("A. G."). Ashcombe wants the land and will send a lawyer, not a gun.`;

const SECRET_SIX = `What happened at Tower Six

Last March (six months before the season opens) the crew of Six, Ines Calloway and Pell Garrity, watched the lights at the Hendricks place and went to the Old Lot fence at 2:11 a.m. to see. A fresh-dug grave stood open there, a hole full of dark that sounded, to Pell, like a child. Pell went down. Ines called it in on the radio ("he's in the roll"), and then the channel went quiet. Pell died in the grave. He was the great-grandson of Nora Garrity, a passenger, the Tally's thirty-first name of the sixty-three (the count that March stood at thirty), and her open grave called to his blood. His death is not a sixty-fourth name: it is why Nora's is the next to surface. Ines, ashamed and afraid, drove out of the valley that dawn and sends Marisol Ochoa a postcard each month with no return address.

June Abernathy logged the night as radio failure because the Board's regional office told her to: a missing Watcher closes a tower's budget, and the Board was about to cut Six anyway. She has hated herself since. The post was filled in September by Emmett Roake, a Revenant who had his own reasons to come to the Old Lot (the 1911 deckhand who made a promise to a drowning girl, Mina: that her name would be written down). He hears Pell on the dead channel at 2:11 and does not answer; if someone does answer, Pell asks for Ines. The way to close it is to find Ines, or write Pell's name in the town record, or take him home.

June knows more than she says. She saw Six's lamp lit on a night with nobody to light it, and every night since she has logged the 2:11 in a second book she keeps at home. She does not lie to be cruel; she is afraid that saying it would make the Board close Six for good. Ask her gently and she will hand the book over.

Pell is not malevolent. He is a man who kept watch and is still keeping it. The channel can be a source of leads (he knows where the digging is) if the Watchers are kind.`;

const T_RADIO = `# Grave Watcher — The radio net tonight

Roll 1d20 for what comes over the net on an ordinary night, hour by hour. Mostly not monsters.

## The radio net tonight (1d20)

1. A song request for June's tape. She has twelve cassettes and a strong view on each. The net votes.
2. The pie net: someone says the last slice of Marisol's blueberry went to the wrong person. Four towers take sides.
3. A stranded driver rings dispatch from the county road. June asks the nearest tower to flash a lamp so he can find the turn.
4. "Tower Eight, check in." A long pause; then Eight's slow voice reads the last line of a book, and signs off.
5. Eli Sandoval's repeater picks up a ham in Ohio reading baseball scores. It cannot be fixed for an hour.
6. Gossip relay: who was seen leaving whose house at six in the morning, with three tower guesses and a bet.
7. A hound barks at nothing along the Catholic Rise fence. Every tower has a theory. None are right.
8. June reads Walt's latest notice. It has seven items. One is about parking.
9. A Watcher admits the stove is out and asks for stove advice. Four people answer at once, and the advice conflicts.
10. A birthday. The whole net sings, off-key; on one low note Eight joins in.
11. Static with a tune in it: a hymn, faint, from nowhere. It stops at the end of a verse.
12. Weather report from the net: a fog bank is rolling up from the reservoir. The towers vote on pea soup or oatmeal.
13. Tommy Reyes keys the mic from the Lamplight's phone-in line: "Is it true you can see the whole yard from up there?"
14. Someone has left a lawn gnome on the Tower Three ladder. Then Tower Seven finds two. An investigation begins.
15. A crossword clue, seven letters, "keeper of the dead." The net argues for ten minutes. June wins with the answer.
16. A worry in a joke: one voice on the net sounds off, tired, too light. "Just the cold," they say. They are lying a little.
17. Rocco Tanaka's tow truck has Tower Nine's propane delivery and cannot find the road. He is at the wrong tower.
18. Owen Lister's rental car is lost in the fog on River Road. He asks the net for the way to the Lamplight and gets three routes.
19. Eight reports a deer standing on a grave, not moving, for an hour. "It is resting," he says. Nobody laughs.
20. Silence at the top of the hour: no check-in from one tower. Ten tense minutes; then a cough and "sorry, asleep."

Use when a night is quiet and you want the radio to be a place. Pick or roll; follow a thread (a pie feud, the lost driver) over several nights. Mark one joke as running.`;

const T_CALLS = `# Grave Watcher — Calls on the radio

Roll 1d20 for a call that means going down the ladder. One per bad night; never two in a row.

## Calls on the radio (1d20)

1. A green light moves between the graves of the Catholic Rise, walking like a person reading names.
2. A fresh grave in the Paupers' Field with no stone, the earth sunken as if something rose from it.
3. A voice answers on the Children's Hill from where no one is, using a Watcher's childhood nickname.
4. The Drowned Ground gate is unlocked from the inside. The salt line has been scuffed.
5. A mourner who did not leave at closing: a car at the gate, keys in it, nobody.
6. The bell-wire on the fence is ringing without wind. Dogs howl in town.
7. A sleepwalker in a nightgown, a townsperson, walking toward the Old Lot at three a.m.
8. The ward-lamps around the Rise gutter one after another, counting inward.
9. Spade sounds at the Old Lot fence. No light.
10. The dead channel: two clicks of the mic at 2:11. Then "Six, all quiet."
11. A marker has moved a yard from where it stood at dusk. A Watcher is sure.
12. Three teenagers with flashlights on the Children's Hill; they swear someone was calling their names.
13. Frost on the Drowned Ground in warm weather. Lights beneath the water.
14. A funeral is due at dawn, and the grave dug yesterday is already occupied.
15. A vehicle without lights on the old ferry road, near the Hendricks place.
16. An ordinary animal, a deer or a crow, guards a grave and will not be moved.
17. A hymn from the shut chapel in the yard at three a.m., many voices, four-part harmony.
18. A fence breach: a stretch of the fence is down, with tracks leading out toward town.
19. A Watcher's voice on the radio calling for help from a tower, but they are standing beside you.
20. Something tall at the edge of the fog waves a long sleeve. Waving back is a mistake.

Use when the night turns. Follow with a Face Danger or a Gather Information, not a fight. Taint by its triggers (Running it) where a working or the yard is involved, and nothing for an ordinary call. Resolve it before dawn, or log it and carry it into the town scenes.`;

const T_STIRS = `# Grave Watcher — What stirs in the yard

Roll 1d20 for what is actually there when a call goes down. Most of it wants something small.

## What stirs in the yard (1d20)

1. A woman in a grey coat looking for a headstone with a name that is not on any. She is polite. She wants to be told it isn't here.
2. A child's ball rolls to your feet from nowhere. Someone wants to play. It's not a trick, and it is still wrong.
3. A man digging with a spade made of nothing, patient, as if for a long time. He wants to finish before dawn.
4. Dogs, six of them, grey, sitting in a circle on a grave. They look at you and then at the grave. They want you to leave.
5. A ward-lamp that burns the wrong colour in one spot. A working's edge. Salt burns it back.
6. A voice that sounds like the Watcher's dead mother. It will ask to be let in. It does not know it is not her.
7. An old Watcher in a yellow slicker, walking his round, forty years late. He says the fence is fine. It isn't.
8. Fog that behaves, thickening around one headstone and thinning from a path, as if it is guiding.
9. A grave where flowers appear overnight: fresh, wet, a different bunch each time. Someone is being remembered by someone.
10. A mourner, living, drunk, crying at the Paupers' Field, who thinks the Watcher is a priest.
11. A crow with a ring in its beak. It leaves the ring on the Watcher's boot. It is a wedding ring. There is an inscription.
12. A girl in a nightgown skipping in the Children's Hill grass. She says "my brother is not in there." There is a name on the grave she points to.
13. The sound of a typewriter. One keystroke at a time, from inside a mausoleum. It is writing a letter.
14. A line of salt broken from the inside, and a trail of wet footprints heading toward the reservoir.
15. A man in a good suit, standing very still among the headstones, who greets you by name. He says he is "waiting for the others."
16. The smell of baking bread at three a.m. in the Founders' Plot, and a whistle: someone's mother, everyone's.
17. A statue on the Rise has turned its head since dusk. It has not moved since. A Gargoyle knows better.
18. A sink of black water under a gravestone, stirring. It will answer one honest question. It prefers the Watcher's name in return.
19. A living kid on the Hill who says he is Tommy Reyes's friend. He is not on the town's rolls.
20. Nothing. A perfectly calm night, stars like salt. The Watcher has an entry to write. This is the loveliest table result.

Use when the call is real and you need a face. Most of these can be talked to. If a Taint trigger applies (Running it), manage_meter adjust Taint +1; otherwise nothing.`;

const T_SECTIONS = `# Grave Watcher — Sections and graves

Two tables: where in the yard something is, and what a stone says.

## Sections and graves (1d20)

1. The Paupers' Field, row of wooden stakes, one of them new. Someone is pretending to be a pauper's relative.
2. The Paupers' Field, the corner where the 1918 flu dead lie: a single long mound, and a child's drawing weighted by a rock.
3. The Catholic Rise, a statue of a saint with a cracked halo. The pigeons avoid it.
4. The Catholic Rise, a family vault with the door ajar and a lit candle inside.
5. The Catholic Rise, the grave of a priest who died mid-sermon. His bell still rings in the hour he died.
6. The Children's Hill, a small stone with fresh toys. Someone in town leaves them. Find out who.
7. The Children's Hill, a swing in the grass that no one planted. It moves when the wind does not.
8. The Children's Hill, a row of identical stones for the 1927 fever. Names missing from three.
9. The Drowned Ground, the old church bell tower, a stump in the shallows, visible in drought.
10. The Drowned Ground, the gate with its salt line and a rusted padlock the key of which is on June's desk.
11. The Drowned Ground, a rowboat tied to a drowned stake. It has been tied there since before the reservoir.
12. The Old Lot, the fence line, further in than the map. A strip of ground that seems just-turned.
13. The Old Lot, a stone with only the letters A. G.
14. The Old Lot, a flat clearing where the grass is a different green.
15. The Founders' Plot, an iron-fenced family stone with eleven Pruitts. Walt has opinions about the weeds.
16. The Founders' Plot, Pearl Whitlock's three husbands in a row, with a bench she brought herself.
17. The Chapel, a locked door and a bell on a wire. Inside, a table set for a funeral nobody has called.
18. The Service Road, a washed-out bend where the hearse sticks. Wendell Boone knows a route.
19. A newer section, the "Garden", with benches and plastic flowers. The living come here. The dead rarely do.
20. A mausoleum, door locked, name unreadable; a Watcher's logbook from 1974 mentions it once and never again.

## Inscriptions (d66: roll ["1d6","1d6"], first die is the tens)

11 "Went to see the river."
12 "Loved by a dog."
13 "Back in a minute."
14 "She put the kettle on."
15 "Not as quiet as you think."
16 "Here at last, and tired."
21 "Beloved husband. Mostly."
22 "Ask my sister about the pie."
23 "He kept the books straight and the rest crooked."
24 "Gone fishing."
25 "Keep the lamp lit."
26 "Don't wake her; she's finally asleep."
31 "Her last words were: I told you so."
32 "A Watcher, thirty seasons, never once on time."
33 "She sang in the choir and never stopped."
34 "Dust to dust, but first the dishes."
35 "The river had him back."
36 "Remember me kindly and loudly."
41 "Taken from us on Main Street."
42 "Please, no more speeches."
43 "He mended what he could."
44 "Her garden is the best in three counties."
45 "Beneath this stone, nothing is wasted."
46 "Gentle with children, hard on knots."
51 "They called me Tiny. I wasn't."
52 "He died as he lived: arguing."
53 "She loved the winter and the winter loved her."
54 "Left to listen."
55 "Born in the valley, did not leave it."
56 "Do not dig here."
61 "Somebody loved me. Remember that."
62 "No dead man was ever as kind."
63 "Rest here, you who are weary."
64 "Count me in."
65 "Her bell rings still."
66 "(a name worn away; a hand-scratched A on the face)"

Use when you need a place or a line of stone. Pick a section from the first table and put an inscription on something the Watchers find; a blank or an unfamiliar name is a clue.`;

const T_WEATHER = `# Grave Watcher — Weather and the fog

Roll 1d20 for the night's weather. In the valley, the fog is a character.

## Weather and the fog (1d20)

1. Clear and cold; the stars like salt. Every light in the yard can be seen for miles.
2. A low fog on the reservoir side only; the Drowned Ground wears it like a shawl.
3. Pea-soup fog: you can't see the next headstone. Sound carries oddly.
4. Light rain, soft and steady; the stove hisses; the radio hums.
5. A warm wind from the south, out of season. The thaw is early.
6. A ground fog that stops at the fence line, as if drawn with a ruler.
7. A hard frost; every blade of grass glitters; footprints show.
8. A thunderstorm over the ridge; the ward-lamps flicker with every strike.
9. A heavy snow; the yard goes silent; every sound is a footstep.
10. Fog with a smell: wet stone, then something sweet, then something burnt.
11. A bright moon and no fog; the shadows of the headstones are long and slanted the wrong way.
12. The fog rises from the ground in streams, as if the yard is breathing.
13. A dead calm; the bell-wires hang still; the hour feels held.
14. Wind in the pines, a note like a flute through the tower's gaps.
15. A mist that clings to the lantern light and makes it a halo.
16. Sleet; the ladder is glass; the Rise is a skating rink.
17. Fog with figures in it. They are cattle from a neighbouring farm, or are they?
18. Thick, warm, close; the air tastes of copper. The Tally's edge is near.
19. The valley fog and the reservoir fog meet over the Old Lot and do not mix.
20. A perfect dawn: fog lifts like a curtain, the yard gold and green; every Watcher on the net says the same word.

Use when you set a scene, and when the fog should do work: hide, reveal or carry a sound. A dawn ends most things.`;

export const GW_WORLD_NOTES: StoryLore[] = [
  starterNote("Grave Watcher — Running it", "dm_instructions", RUNNING_IT, {
    characters: ["Walt Pruitt", "June Abernathy", "Marisol Ochoa"],
  }),
  starterNote("Grave Watcher — This season", "lore", SEASON_PUBLIC, {
    keys: ["season", "this season", "Unrest"],
  }),
  starterNote("Grave Watcher — The season", "secret", SEASON, {
    secret: true,
    keys: ["campaign", "season", "beats", "outline"],
    characters: ["Teddy Vance", "Owen Lister", "Emmett Roake"],
  }),
  starterNote("Grave Watcher — The town calendar", "lore", CALENDAR, {
    keys: ["calendar", "Founders' Day", "Lantern Walk", "festival", "event"],
  }),
  starterNote("Grave Watcher — The Long Acre", "lore", LONG_ACRE, {
    keys: ["Long Acre", "yard", "graveyard", "section", "Old Lot", "Paupers' Field", "Drowned Ground"],
  }),
  starterNote("Grave Watcher — Tower Nine", "lore", TOWER_NINE, {
    keys: ["Tower Nine", "tower", "headquarters", "logbook"],
  }),
  starterNote("Grave Watcher — Hollins Ferry", "lore", TOWN, {
    keys: ["Hollins Ferry", "town", "Lamplight", "Low Water", "Ferry Motel", "Brandt Hardware"],
  }),
  starterNote("Grave Watcher — The Watch net", "lore", WATCH_NET, {
    keys: ["radio", "net", "Watch", "dispatcher", "Tower Six", "call sign"],
  }),
  starterNote("Grave Watcher — The world", "lore", WORLD, {
    keys: ["Board of Wardens", "Kinds", "licence", "Taint", "Unrest"],
  }),
  starterNote("Grave Watcher — The truth of the season's working", "secret", SECRET_TALLY, {
    secret: true,
    keys: ["Tally", "Hester Quill", "Annabel Hollins", "Ashcombe", "strongbox", "Old Lot"],
    characters: ["Teddy Vance", "Lyle Greaves", "Owen Lister"],
  }),
  starterNote("Grave Watcher — What happened at Tower Six", "secret", SECRET_SIX, {
    secret: true,
    keys: ["Tower Six", "Pell Garrity", "Ines Calloway", "2:11"],
    characters: ["June Abernathy"],
  }),
  starterNote("Grave Watcher — The radio net tonight", "table", T_RADIO, {
    keys: ["radio net tonight", "net chatter"],
  }),
  starterNote("Grave Watcher — Calls on the radio", "table", T_CALLS, {
    keys: ["calls on the radio", "going down"],
  }),
  starterNote("Grave Watcher — What stirs in the yard", "table", T_STIRS, {
    keys: ["what stirs", "yard encounter"],
  }),
  starterNote("Grave Watcher — Sections and graves", "table", T_SECTIONS, {
    keys: ["sections and graves", "inscription", "epitaph", "headstone"],
  }),
  starterNote("Grave Watcher — Weather and the fog", "table", T_WEATHER, {
    keys: ["weather", "fog"],
  }),
];
