/**
 * The Last Resort (Blood & Bone E5, design docs/bb-starters-design.md 4,
 * decisions 165, 167-169): the notes. Original text (decision 3). The shape
 * (a family inherits a haunted hotel and runs it with its ghosts) is the only
 * thing borrowed; every name, place and rule here is this starter's own.
 */
import type { StoryLore } from "../../../../structs";
import { starterNote } from "../shared";

const RUNNING_IT = `# The Last Resort — Running it

A season at the Belhaven, a broke 1920s hotel in Cutler's Bend, left to a family by a relative who died in it. The hotel is full of the dead and something sits in the boiler room. Comedy and horror from the same place: let the dead be funny and the danger be real. A ghost's running bit gets laughs; what the cold does to a living guest does not. Never wink at the horror to rescue a joke, and never kill a joke to prove the horror.

Rhythm. A booking is a week, but the rules count nights. A week usually holds one or two played nights; call end_session at each dawn played, so the Reckoning, recovery, "used tonight" and once-per-session limits run as written. Each week has a booking (roll "Bookings this week"), a problem with the dead ("What the dead did last night", "Room trouble"), and the bills. Under the weeks run the seven beats in the secret The Last Resort — The season (the public calendar is This season). Read the season at the start of each week, the residents when a ghost is on stage, the Belhaven when the party moves rooms, Cutler's Bend for townsfolk, The will when a clause matters.

The rules, reread. Exposure works as written, with its thresholds read for the hotel, and means paying guests noticing: a ghost seen in daylight, a bill that makes no sense, a scream. The town half-knows and does not talk about it, so townsfolk never raise Exposure. Its thresholds read for the hotel: "in the home city" means in the Belhaven, a compromised Haven is a room the guests now avoid, and Burned (6) means the guests know about this one of you: they will not be served by them, and Vacancy +1; nobody has to leave. Heat does not exist here: the world meter is Vacancy (0-6), already in Meters & tracks, so do NOT create the City set. Raise it with manage_meter adjust Vacancy +1 for a refund, a bad review, a guest who flees, an unpaid bill; lower it by 1 for a full house, a wedding that goes well, a review that says "charming". Thresholds: 3 the bank sent a letter, 4 the bank sends a man (Orme), 5 a buyer is circling, 6 the doors close. In the end-of-session reminder, "Heat" means Vacancy. The core's list of oracle tables does not apply; use the Last Resort tables: Bookings this week, Guests, What the dead did last night, Room trouble, Town faces (all 1d20).

Fights. The dead are almost never fights. A cold hand in a hallway is Troublesome (one action_roll); Hester at her angriest, or the Colonel when told the date, is Dangerous. The thing in the boiler room is Formidable or higher and is never beaten head on. Do not use start_combat.

The cast. The family is the roster in The Last Resort — The family: Dara (the named heir), Wren (teen who hears the dead), Otto (younger, a club with a ghost), Winnie Alder (the relative who died; playable as a Ghost) and Gideon (the in-law who is hiding something). With one or two players, the unplayed relatives are in the hotel and are yours: give each a small want per week, and let them help only when asked. If nobody is Winnie, she walks in with no memory of her death by Week 2.

Treat the Masquerade as comedy first: the guests invent explanations ("old building", "clever staging") until one of them does not.

If there is no Campaign Plan note yet, write one before the first week: a medium spine, seven beats, from The Last Resort — The season (read the secrets first). Then session zero builds the characters (B&B — Character creation, or the five pre-made family members), the setup card is approved, and start_game runs. Open on the lobby, the bell ringing by itself, Mr. Pell at the desk.`;

const SEASON = `The Last Resort — The season (the GM's outline; the players have This season)

Dara Alder's great-aunt Winifred ("Winnie") ran the Belhaven for forty-four years and died in it last May. Her will leaves the hotel to Dara on one condition: it stays open to the public through the season, until 31 October. Fail, and it is sold to pay the bank. The family arrives the last Friday of August. The Belhaven needs about four rooms taken every night to break even. A full house is twenty-six.

The season is about nine weeks. Run seven beats, in order, with slack weeks between for a booking and nothing else.

1. **Check-in** (Week 1). The will, Mr. Pell, the bell. First guests: a birding society. The bank's letter is on the desk. The family learns the three rules of the house: the dead are residents, not guests; the lobby is Pell's; nobody carries anything to the basement after dark. Vacancy 3.
2. **The full house** (Week 2). A wedding Winnie booked a year ago: two feuding families. The Silver Room is open, and Delphine's party never ended. If the night goes well, Vacancy -1; if the party spills into the lobby, +1.
3. **Strangers with cameras** (Week 3). A ghost-hunting crew arrives wanting proof. The dead decide to give them a better show than the building can afford. The crew's producer sees something real.
4. **The room that isn't there** (Week 4). A quiet man in a grey coat asks for the room at the end of the corridor that is on no plans. The register already has a line for it. The boiler goes out for a night. The first cold week.
5. **The audit** (Week 5). Thaddeus Orme from the bank and a fire inspector come to see the books. Vacancy hits 4 if nothing is done. The town stops dropping off casseroles.
6. **What Winnie wrote** (Week 6). Winnie hid a letter where only family standing in the lobby at midnight would find it. It opens the question of how she died. The residents split: some want to be freed, some want nothing to change.
7. **Checkout** (Weeks 7-9). Founders' Weekend, the last full house of the season, and the boiler room. The family must decide what to do with what lives down there: feed it, evict it, let it leave, or something they invent. The ending is whether the doors stay open.

The truths are in the other secrets: how Winnie died, what the Boarder is and wants, what Gideon is hiding, and the song. Decide nothing in play that they contradict. Reveal them through people and places, one fact at a time: a witness, a record, a room.

Tracks. "Keep the doors open" (the family's Vow, Epic): mark when the fiction earns it, with a full house, a month of solvent books, a bargain with the bank. "Why did they die?" (Formidable): mark on each of the facts learned. The Ghost Seeker's Unquiet Record works on it.

Endings that count: the doors stay open and the dead stay (the hotel is a home for them); the doors stay open and the dead move on (the hotel is a hotel); the doors close and the family leaves with something; the doors close and the family stays. Run what the family earns.`;

const THIS_SEASON = `# The Last Resort — This season

Winifred "Winnie" Alder ran the Belhaven for forty-four years and died in it last May. Her will leaves it to her great-niece Dara on one condition: it stays open to the public until 31 October. Fail, and it is sold to pay the Bend Savings & Loan.

The family arrives the last Friday of August. The loan is $186,000, due in full on 1 November unless the hotel has been open through October. About four rooms a night break even; a full house is twenty-six. The season is about nine weeks, and the last big weekend is Founders' Weekend, at the end of October.

The family's Vow, "Keep the doors open", is the season's track.`;

const BELHAVEN = `# The Last Resort — The Belhaven

Built 1924 by Cornelius Belhaven. Six floors including the basement and the roof, 412 numbers on the plans but only 61 rooms in fact, 41 usable. Brass, green marble, a ceiling-high lobby mural of a river that has lost two inches every decade. Smells of floor wax, boiled coffee and cold stone. No Wi-Fi in the walls; a card machine that rejects things; a lift (the Otis, tends to stop at the basement).

**Basement.** The boiler room (down the service stairs, a steel door painted green); the laundry (Hester's); cold store; the Sunday door, a small hatch beside the boiler where a plate was left every week. Never warm in the usual sense. The boiler runs. It runs even with the fuel off, and when it is unhappy the whole hotel's heat dies.

**Lobby floor.** Front desk (Mr. Pell, the bell, the register, a pigeonhole wall); the Hush Bar (lounge, fireplace that lights itself); the Belvedere Room (dining, thirty covers); the kitchen (Chef Rooke); the Silver Room (the ballroom, sprung floor, gramophone, chandeliers that sway to a song that isn't playing); a service corridor; the dumbwaiter's ground stop.

**Floors 2 to 4.** Guest rooms in two wings. 2nd: families and long stays. 3rd: the good rooms, 301 to 312. 4th: Winnie's suite (401), the linen store and a stairwell to the roof. Many rooms are shuttered, with dust sheets.

**Roof and cupola.** Pigeons, a rusted weathervane shaped like a bellhop, and the best view of the Bend. The town can see the hotel's lights go on.

**Rooms with trouble (use Room trouble).**
- 102, the Hush Bar: the fire lights when anyone lies in front of it.
- 214: Mrs. Grandison's, always occupied, always a typewriter going.
- 301: the Colonel's, the bath runs hot at six.
- 305: mirror room: Odile lives in the tall glass.
- 309: the bed is made again within a minute of being unmade.
- 311: the radio plays 1947.
- 401: Winnie's suite. Her tea is still on the table. The register in her desk is blank for one page.
- 412 on the plans is the roof door. Room 0 is on no plans (see the secret).

**What is where.** The master keys are in the pigeonholes. The old register is in Winnie's desk. The deed and the lease are in the lobby safe (the combination is Pell's birthday, which he will not give out; it is also the date the Room 0 line was written in the register, and he cannot lie about a room, so ask him when Room 0 was entered). The Sunday plate was a covered dish; the Boarder wants a plate.

**Money.** The loan is $186,000 at the Bend Savings & Loan, due in full on 1 November unless the hotel has been open through October, in which case the bank must refinance (the will's lawyer says so; Mr. Orme says otherwise). Costs about $14,000 a month. Average room $120 a night. A bad week loses $2,000; a full house earns $9,000.`;

const RESIDENTS = `# The Last Resort — The residents

About forty of the dead are on the books; eight matter. Each is a want, a room, a rule and a running bit. The dead are residents, not guests: they do not pay, they do not check out, and they have views on new management.

**Mr. Ambrose Pell**, the front desk. Died in 1961 at his post and has not taken a day off since. Polite, tireless, appalled by the new card machine. *Wants* the hotel run properly, which means the way it was in 1961. *Rule:* he cannot leave the lobby, and he cannot lie about a room. *Bit:* he says "I'll see what I can find" and always finds exactly the right thing. *Use:* ask him a question and he answers exactly; ask him the wrong one and he answers that.

**Mrs. Lucille Grandison**, 214. Died 1983 in the armchair, mid-sentence. Dictating her memoirs ("When I was in Havana…", and Havana changes every time). *Wants* a living person to type them up. *Rule:* she is only solid while someone is writing down what she says; stop writing and she fades. *Bit:* every anecdote has a different husband.

**Pip Dunmore**, bellhop, the dumbwaiter and service routes. Died 1938, age nineteen, in the shaft. *Wants* a tip. A real silver dollar, not a promise. *Rule:* he travels only by service routes: dumbwaiter, chutes, back corridors. *Bit:* "I'll take that" and delivers it to the wrong room. President of the Dumbwaiter Society, which has two members.

**Delphine Corvin and the Gala of '58**, the Silver Room. The party that never ended; Delphine sings with a band of nine, a hundred dancers. *Wants* the last number played (the drummer never got to it): the song the will names. *Rule:* a mortal in the ballroom must dance one dance to leave; while the party is on, the room is warm. *Bit:* calls everyone "darling" and takes requests. Winnie asked in writing that one song not be played (see the secret The song); the band keeps asking.

**Miss Odile Marrow**, the mirrors. The seamstress and hair-dresser, died 1952. *Wants* to be looked at properly. *Rule:* she appears only in mirrors and can see what is reflected, including behind you; she cannot lie in a glass. *Bit:* a verdict on everyone's posture, hair and shoes; spoils the plot of whoever is behind the next door.

**Chef Anselm Rooke**, the kitchen. Died in the cold store in 1974. *Wants* one perfect service. *Rule:* he cooks only when someone calls orders; his food is real to the living and tastes of the best day of their life, and tastes of nothing the next morning. *Bit:* tickets that come from nowhere ("table nine, two Wellingtons, now").

**Colonel Barnaby Strand**, 301. Died in the bath in 1947 and thinks it is 1947; the hotel is under new, shoddy staff. *Wants* his bill settled ($11.40). *Rule:* a living person cannot tell him he is dead; he goes cold and loud. A ghost he trusts can. *Bit:* he complains about the radio, which plays 1947.

**Hester Quill**, night maid, the laundry, after midnight. Died 1996, never clocked off. *Wants* the hotel clean and the family safe; guards the green door. *Rule:* she appears only between midnight and five, and can lock any door in the building but one. *Bit:* a chocolate and a note on every pillow; the notes are passive-aggressive.

Playing the dead: they have jobs, habits and opinions, but they are not safe. A ghost who is crossed gets cold: a chill, a breath on the neck, the wrong face in the mirror. Leaving, one rule. Solving a want gives a resident peace, not departure: the cold stops, the bit softens, they are settled. While the Boarder holds the building they cannot go, and it holds every resident on the register (all eight here, and the rest). They go when it is checked out or evicted, or may choose when it is bargained with. Hester's Sunday plate only keeps the Boarder fed; it neither holds nor frees anyone. Winnie is the exception: she died unbound, so her Seeker rule decides when she moves on.`;

const TOWN = `# The Last Resort — Cutler's Bend

Pop. 3,100, in the hills above a bend in the Marlow River. A tannery turned brewery, a main street of two blocks, a hardware store, a diner, a bank. The Belhaven stands on the rise over the river, and the town can see it from everywhere. The town half-knows and does not talk about it. Nobody says "ghost". People say "the Belhaven is old", leave a casserole, and walk on the far side of the street after dusk. The hardware store sells salt by the sack and asks no questions. The town does not want the hotel to close, and it does not want to go in.

**Places.** Haskell's Hardware (Mags); the Pickled Heron (the tavern; the bar's mirror faces the hotel); Firstlight Bakery (Bernie); the Marlow Diner (Dev's shift); Bend Savings & Loan (Orme); the sheriff's office (Fenn); the Odd Fellows hall (Founders' Weekend); Quist's church, which has never held a funeral for a Belhaven resident; the river path and Tannery Falls.

**Town faces (use Town faces).**
- **Odessa Brill**, mayor, 63. Runs the Founders' Weekend, which is the hotel's last full house. *Wants* it to go smoothly and quietly. Will do almost anything, except mention the hotel's reputation.
- **Sheriff Amos Fenn**, 58. Writes "natural causes" on everything. *Wants* retirement in March, and no loose ends.
- **Dr. Imelda Tuck**, coroner and large-animal vet. Signed Winnie's certificate. Brisk, and goes quiet when the service stairs come up. *Wants* to be left out of it.
- **Thaddeus Orme**, manager of Bend Savings & Loan. Polite, thin, a reader of fine print. *Wants* the loan repaid or the property sold. He is in contact with a buyer.
- **Marguerite "Mags" Haskell**, Haskell's Hardware. *Wants* her salt account paid. Will deliver anything to the hotel's kitchen door and never come in.
- **Reverend Lowell Quist**, 70. Will not bury the hotel's dead and will not say why. *Wants* to be asked the right question.
- **Bernadette "Bernie" Kowalczyk**, Firstlight Bakery. Supplies the hotel breakfast and a running commentary. *Wants* Winnie's last order paid.
- **Dev Raman**, 17, the diner's line cook. Talks to anyone. *Wants* out of Cutler's Bend, and a good story to take with him.

How the town helps: a casserole, a tip, a rumour, a ride. How it hurts: a petition, a bad review that says "old building, odd smells", an inspector it let in.

**Founders' Weekend** is the last weekend of October: parade, a street fair, every room at the Belhaven booked months ago by people who wanted to see the old hotel lit up for the season. It is the best weekend of the year and the worst possible one.`;

const WILL = `# The Last Resort — The will

Read in the Belhaven's lobby by Mr. Oswin Teague, Esq., of Teague & Daughter, who leaves before he finishes. The text is dry; the clauses are hooks. Quote it, or have the GM read the clause that matters.

*I, Winifred Anne Alder, of the Belhaven Hotel in Cutler's Bend, being of sound mind and a body that has done its best, declare this my last will.*

**1.** I leave the Belhaven Hotel, with its contents, fixtures, furnishings and residents, to my great-niece Dara Alder, who is the only one of my kin with the patience to read a lease.

**2.** On the condition that the hotel is kept open to the public, in good standing, until the thirty-first of October. If it is not, it is to be sold, with the proceeds to the Bend Savings & Loan before any other claim.

**3.** I ask, and I have never before asked anything of anyone in writing, that nobody carry anything down to the boiler room after dark, and that the Sunday plate not be prepared. Do not feed the basement. I will not explain this here.

**4.** To Mr. Ambrose Pell, who held the desk before I was born and has not left it since: his post, for as long as he wants it, and my apology about the card machine.

**5.** The Silver Room is to be left unlocked and the gramophone left alone. If a girl in silver asks for Last Dance at the Belhaven, I am sorry. Do not play it.

**6.** To Mrs. Lucille Grandison, room 214: typewriter ribbons at cost, in perpetuity.

**7.** To Wren Alder, my mother's hand mirror, which will tell her the truth if she asks politely. To Otto Alder, the dumbwaiter, subject to the safety inspection.

**8.** The register is the deed. Whatever it says in the lobby safe, the register says more. Do not let Room 0.

**9.** I have written down what I know and put it where only family, standing in the lobby at midnight, would trip over it. If my death was not what the doctor wrote, I will find out myself. If I can't, someone else will have to.

*Witnessed by O. Teague, A. Pell (his mark, in the register), and a cat.*

Using it: clause 3 and 8 are the plot; 5 and 9 are the Seeker's hooks; 4, 6 and 7 are warm. The lawyer, if sought, says the will was dictated in a hurry the week before she died, and is more frightened than the family; he would like to be paid, and to leave.`;

const SECRET_DEATH = `How Winnie died

Natural causes, and not. Winifred Alder died at 11:40 on the night of 14 May, age seventy-four, of heart failure on the service stairs between the boiler room and the kitchen, carrying the Sunday plate back up, uneaten. She had decided the week before to stop feeding the Boarder: the feeding was a bargain made in 1924, and it was what kept the hotel's dead unable to leave. She meant to starve the Boarder until it left or showed itself, and settle the dead's business meanwhile, so that they could go when it did. She was seventy-four, carrying a tray up thirty stairs, and the thing downstairs called her name up the stairwell for an hour and she ran from it. It did not touch her. It does not need to.

The facts, each held by someone: (1) she went down at ten with the plate (Pell saw her go; he cannot lie about a room, so asked about the basement he says so, and anything more he tells is his choice); (2) she came back up alone; Hester saw her pass the laundry and heard her counting the stairs aloud; (3) the plate was found cold on the landing and Chef Rooke has kept it in the cold store; (4) Dr. Imelda Tuck saw the coat-hook marks on her sleeve and the burn on her palm and wrote "heart"; (5) she wrote the will clause that week and left a letter under the lobby's third floor-tile; (6) the Boarder called her by a name she had not heard since 1971, her childhood name; (7) Sheriff Fenn was called at midnight, saw the burn and the plate and heard the boiler, and wrote "natural causes" to keep the town out of it; (8) Dr. Tuck, called to the stairs, felt the cold and heard her own name called, and signed "heart" to be done with it, and will not say so.

Her ghost, if one wakes, has no memory of the night. The last fact (6) is the full truth. If she is a Ghost Seeker, count the facts as they are learned, and say when one is left.`;

const SECRET_BOARDER = `What is in the boiler room

The Boarder. In 1924, on the Belhaven's opening night, Cornelius Belhaven signed a guest into Room 0, on no plans, and agreed a rent: one plate each Sunday, and a lodger who would not leave, one every decade, so the hotel never stood empty. The weekly plate keeps the existing bindings; only the decade brings a new permanent lodger. The next falls due on the last night of this season. The Boarder is not a demon. It is a guest that cannot check out, and it has been paid to stay. It keeps the building warm and the hotel booked in its own way. It is why the dead of the Belhaven cannot leave: it holds every resident on the register, settled or not. Solving a want brings peace, never departure; only the Boarder going lets them go. Hester's plate only keeps it fed. Winnie died unbound and is not held.

It wants a room, a name on the door, a plate, and to be treated as a paying guest. It has never been treated as one. What it fears: being unseen on the register. It cannot leave without someone with a right to the register checking it out. That is a signature, and it is Dara's now.

Since the funeral Hester has left the plate every Sunday at midnight, because the boiler rattled the first week she did not; the family does not know.

Behaviour. Hungry (plate not left) for a week: the boiler fails and the hotel goes cold. Two weeks: it calls names up the stairwell, and a living guest goes down to answer. Three: it takes a lodger early, a living guest kept, as if the decade had come. If fed it is quiet and the bindings hold; no new one is taken before the decade. Its voice is a polite, patient clerk's, and it sounds like a friend. Presence: a flat, steady heat, damp wool, a coin-counting sound.

Ways out. Feed it (the hotel runs, the dead stay, no one new is held before the decade); evict it (needs the founder's lease from the safe, and the register's last page); check it out (sign it out, and then it leaves, and every settled resident goes with it, and the heat goes); bargain it a room (a real, named room and a real plate, and it becomes a long-stay guest); or destroy the register (the hotel and the dead go too). Do not make the right answer obvious.

Rank Formidable, and Epic if the register is signed in its favour. It is never fought head on.`;

const SECRET_SONG = `The song

"Last Dance at the Belhaven" was the tune of the opening night in 1924, and Delphine's last number at the Gala of '58, which the drummer never reached. Its last bar is the Boarder's invitation: the one dance it was never given.

Part of it (the gramophone, a few bars, the table's result 13): the Silver Room warms, the boiler answers in time, the dancers lean toward the basement door and every resident in earshot feels pulled toward their old room. Sleepers dream of the corridor. The living in the room take 1 Stress.

All of it: the Boarder comes up to the Silver Room as a guest, visible, for one dance. This is the one time it can be spoken to, bargained with or signed out in person. It will ask a mortal for the dance, and a mortal who dances it is the decade's lodger and cannot leave. If the dance ends unfinished, the party ends too, and Delphine with it. Winnie knew; that is why she wrote the clause.

Delphine does not know. She only wants the last number played.`;

const SECRET_GIDEON = `What Gideon is hiding

Gideon Marsh, the in-law who came to help, is on the payroll of Corbin & Vane Hospitality, which wants the Belhaven's land. A geothermal spring runs under the boiler room (the Boarder's warmth is partly real), and the site is worth a spa resort. Ines Vane has paid his debts and a monthly retainer to report on the hotel's finances and its state, so the bank sale is clean. He did not know about the dead. He has been sending reports since the funeral. He is now fond of the family, frightened of the building, and in too deep.

Orme at the bank is Corbin & Vane's other contact. Beat 5, the audit, is the day the reports collide. How it comes out is the Gideon player's or the GM's choice: confession in the lobby, discovery by Wren (who reads over shoulders), Odile showing the room behind him in a mirror. He can be saved. The buyer's offer is real and would pay the loan, which is a temptation for Dara.

If the Boarder is checked out, the spring cools, and the buyer loses interest.`;

const T_BOOKINGS = `# The Last Resort — Bookings this week

A booking is a group with a want and a catch. Roll one a week. Names are yours to invent.

## Bookings this week (1d20)
1. A wedding of two families who stopped speaking over a hardware-store lawsuit. The Silver Room is booked. So is Delphine's party.
2. The Cedar Valley Birding Society, nine retirees, up at 4 a.m. They log everything that flies past, including a thing that does not fly.
3. A ghost-hunting TV crew wanting four nights and a free hand. The dead are professionals and critics.
4. A silent meditation retreat, twelve people, three days without speaking. The dead do not do silence.
5. A honeymoon couple who asked for "the haunted room". They are disappointed so far, and one of them is bored enough to dare the basement.
6. A class reunion, class of '94. Someone has brought the person they all wronged.
7. A tour coach with a cracked axle: thirty-one pensioners, one night, every room, and a driver who wants a drink and a story.
8. A murder-mystery dinner company. Their script has a body in the cellar. So does the cellar, a little.
9. A food blogger who writes one sentence per dish and has never given more than three stars. Chef Rooke has heard.
10. The county fire marshal, polite, with a clipboard and no sense of smell. The boiler room's door is painted green.
11. A family reunion around a grandfather who stayed here as a boy in 1961 and wants to die in a hotel he remembers. Pell remembers him too.
12. A location scout for a film that needs a hotel that looks haunted. This one does not need to try.
13. A sleep study: eight volunteers wired to monitors that pick up everything. The dead are rude about being measured.
14. A bridal party of eight and the bride's mother, who has opinions on the towels. Hester has opinions on the mother.
15. A motorcycle club that is a book club: nineteen leather jackets and one reading list. They will read anything, including the register.
16. A single man in a grey coat who pays cash for a month and asks for the room at the end of the corridor, the one that is on no plans.
17. An insurance auditor checking the roof claim, who finds the roof is the one thing in the building that is exactly as old as it says.
18. A funeral reception for a stranger. The dead pay their respects, loudly, in the wrong order.
19. A yoga weekend. The boiler has a view on the heat; Hester has a view on the mats.
20. A conference of professional skeptics, keynote "There Is No Such Thing". They have been told the hotel is haunted, and are thrilled.

Use when it is the start of a week, when the family is hungry for a plot, or when the bank's letter needs a reason to be answered.`;

const T_GUESTS = `# The Last Resort — Guests

A single guest, to put in a room for a night or a week. Pair with Room trouble. Each has a quirk and a snag.

## Guests (1d20)
1. Dolly Pemberton-Ray, 80, a retired stage magician. Sees the dead and assumes it's a good trick; wants to know how it's done.
2. Mr. Hugo Nwosu, a travelling salesman of smoke detectors. Nervous. Every detector in his case goes off in the lobby.
3. A pair of twins on a road trip who finish each other's sentences and have not noticed the ghost doing it too.
4. Prof. Margit Aalto, a folklorist who is delighted and takes notes. Her notes are dangerous to the Masquerade.
5. A man who has been dumped by text and wants a quiet room and a drink. Odile has seen the text.
6. Cassidy Frost, 24, a travel influencer with 900 followers and an iron stomach. Posts everything.
7. A retired nurse, Mrs. Odell, who feels the Colonel's chill and puts a blanket round it.
8. A very small dog, Biscuit, who can see everything and has strong opinions. His owner does not.
9. A sullen teenager, sent by their parents, who thinks Wren is cool. Wren has noticed.
10. Mr. Alaric Venn, a quiet man in an old suit, who checks in, pays in cash and is gone by morning. His room is cold.
11. A woman on the run from a husband, who needs a room with a lock, not a story. Hester will help.
12. A rival hotelier on a "friendly visit" with a notebook. He is on the take from the buyer.
13. A pilgrim of the Belhaven's old fame (it had a 1950s Hollywood moment), who wants the Silver Room and a dance.
14. A health inspector's cousin who has never been scared and today is determined to remain so.
15. A grieving widower who has come to ask the dead one question and does not know which of them to ask.
16. A pair of honest-to-goodness ghost hunters, quiet, expert, kind. They do not want to ruin anything; they want to talk.
17. A child of ten who sees Pip and does not scream. Pip is overjoyed. Otto is jealous.
18. A heavy sleeper, who sleeps through the night's trouble and files a five-star review for the "tranquil atmosphere".
19. A man who wants Winnie's room and has a letter that says he's owed it. The letter is old, and in her handwriting.
20. A town regular who never stays, who tonight has a reason to. Roll Town faces.

Use when the week needs a single face, when a guest is needed for a ghost to scare or befriend, or when the Vacancy needs a human reason to move.`;

const T_DEAD = `# The Last Resort — What the dead did last night

Roll one when the family comes down in the morning. Funny, strange or ominous. The guests see the evidence, not the cause.

## What the dead did last night (1d20)
1. Rearranged every chair in the Hush Bar to face the door, and left a count on the bar: 47.
2. Ran the bath in 301 for the Colonel, who wants it hot. The pipes have not forgiven them.
3. Delphine's party spilled into the lobby. The conga line has not gone back.
4. Hester folded every towel in the building into swans and left one for the family with a note: staff comment cards go here.
5. Pip delivered a guest's breakfast to a room that was empty, and the tray is gone.
6. Mrs. Grandison finished a chapter and cried real tears on the carpet. The stain will not dry.
7. Chef Rooke lit the range at 3 a.m. Seven courses, and one of them is still warm on the pass.
8. Odile told a guest in a mirror what was behind them. It was nothing, and then it wasn't.
9. Pell checked a guest in. There is no such guest. The register has a signature.
10. Every clock in the building stopped at 11:40.
11. A guest woke to find their luggage unpacked, pressed and labelled "do not wake".
12. The Otis went to the basement by itself and came back with the doors steaming.
13. The gramophone played a few bars of the one song Winnie asked them not to play.
14. Someone cleaned the whole second floor, perfectly, and it cost one ghost a memory. Nobody knows whose.
15. A ghost tried to prank the TV crew and succeeded too well. Someone is in bed with a cold compress.
16. Three guests all dreamed the same corridor. They all describe the same door at the end.
17. Pip's club has a new member. Otto is asked to approve the paperwork.
18. The boiler groaned once, long and low. Every ghost in the building stopped to listen.
19. A warm handprint on the cold side of every window facing the yard.
20. Winnie's suite was found tidy, the bed slept in, tea on the table. No one has been seen.

Use when it is morning after a night, when the family needs something to deal with before breakfast, or when the hotel should feel alive.`;

const T_ROOMS = `# The Last Resort — Room trouble

A room that has a problem tonight. Pair with a guest. The trouble is a bit, a danger or both.

## Room trouble (1d20)
1. 102, the Hush Bar: the fire lights when anyone in front of it lies. A guest is lying a lot.
2. 106: a wardrobe that opens on the wrong coat every time, and a smell of someone else's perfume.
3. 108: the door will not stay shut. It is trying to tell you something, politely.
4. 112: the bath drains upward.
5. 204: an ordinary room. A very old man sits in the corner chair and does not know he is dead. He asks you to move your suitcase.
6. 207: a nursery, in a hotel that had none; the mobile turns when someone lies about their age.
7. 214: Mrs. Grandison's. The typewriter clacks; a guest has been put in with her by mistake.
8. 218: the mirror will not show the guest, only the room.
9. 301: the Colonel's bath runs hot at six sharp. It will run on a guest if you do not stop it.
10. 305: Odile's mirror room. She is showing a guest something true they did not ask to see.
11. 309: the bed is made again within a minute of being unmade, by an annoyed pair of hands.
12. 311: the radio plays 1947 and cannot be turned off, unplugged or sold.
13. 303: the light switch controls something that is not the light.
14. 307: the window looks out on the hotel as it was in 1924.
15. 401, Winnie's suite: tea, still warm. A guest has found the page in the register that is blank.
16. The Silver Room: the chandeliers sway. A guest is dancing alone with somebody.
17. The lift: it stops at a floor with no number. Doors open on a corridor that smells of wet wool.
18. The laundry: the sheets are too clean and have names on them.
19. The cold store: Chef Rooke's. The door has frosted over from the inside. Something is cooking.
20. The corridor to the basement: the light flickers on only when someone is carrying something.

Use when a guest or a family member needs a room, when the party moves through the Belhaven, or when a week needs a small problem.`;

const T_TOWN = `# The Last Resort — Town faces

A walk-on from Cutler's Bend. Pair with a want. Everyone half-knows; nobody says. Names are for use.

## Town faces (1d20)
1. Mayor Odessa Brill, with a parade schedule and a smile that has done this before.
2. Sheriff Amos Fenn, leaning on the lobby door. "Natural causes. I'd leave it at that."
3. Dr. Imelda Tuck, in boots, arriving to ask whether anyone's cat has been unwell. She wants to look at the stairs.
4. Thaddeus Orme, from the bank, with a briefcase and no coat. "A courtesy visit."
5. Mags Haskell, with a delivery. She leaves the salt at the kitchen door and will not come in.
6. Reverend Quist, who stands outside the hotel on Sundays and says nothing. Today he speaks.
7. Bernie Kowalczyk, with the breakfast order and Winnie's last unpaid bill, folded very small.
8. Dev Raman, 17, who wants to hear a ghost story and sees through Wren in about a minute.
9. Old Hollis Pike, who drove the Belhaven's taxi for forty years and has not been past the porch since 1989.
10. A pair of teenagers on a dare, at the gate at dusk. They want to go in. They should not.
11. Mrs. Prudence Oyelaran, the librarian, who has the hotel's old plans and a very long lunch break.
12. The mail carrier, Walt, who leaves the post on the step and runs.
13. The Pickled Heron's bartender, Sunny, who sends a free round up the hill every Friday for "the residents".
14. A man from the county, with a form about the roof.
15. Old Mr. Garrity, a retired hotel porter who worked under Winnie, and will not go in either, but will talk on the porch.
16. A woman from the Odd Fellows hall about the Founders' Weekend ball, with a list of requirements and a list of apologies.
17. A pair of brothers who run the brewery and want to use the Silver Room for a launch.
18. A stray dog who has decided the family is his. The dead like him. Odile approves.
19. A stranger at the Heron who has been asking about the hotel. His business card says Corbin & Vane.
20. A figure on the road at night, carrying a covered dish up toward the hotel, who turns back when seen. Hester knows who.

Use when the town should appear, when a scene needs a face outside the hotel, or when the Vacancy needs someone to help or hurt it.`;

export const LR_NOTES: StoryLore[] = [
  starterNote("The Last Resort — Running it", "dm_instructions", RUNNING_IT, {
    keys: ["Belhaven", "Vacancy", "Last Resort"],
  }),
  starterNote("The Last Resort — This season", "lore", THIS_SEASON, {
    keys: ["season", "Belhaven", "bank", "Founders' Weekend", "31 October"],
  }),
  starterNote("The Last Resort — The season", "secret", SEASON, {
    secret: true,
    keys: ["season", "beats", "Belhaven", "Founders' Weekend"],
  }),
  starterNote("The Last Resort — The Belhaven", "lore", BELHAVEN, {
    keys: ["Belhaven", "hotel", "lobby", "Silver Room", "basement", "boiler"],
  }),
  starterNote("The Last Resort — The residents", "lore", RESIDENTS, {
    keys: ["Pell", "Grandison", "Pip", "Delphine", "Odile", "Rooke", "Colonel", "Hester", "ghost"],
    characters: ["Ambrose Pell", "Lucille Grandison", "Pip Dunmore", "Hester Quill"],
  }),
  starterNote("The Last Resort — Cutler's Bend", "lore", TOWN, {
    keys: ["Cutler's Bend", "town", "Orme", "Brill", "Fenn"],
  }),
  starterNote("The Last Resort — The will", "lore", WILL, {
    keys: ["will", "Winnie", "Winifred", "Teague", "clause"],
  }),
  starterNote("The Last Resort — How Winnie died", "secret", SECRET_DEATH, {
    secret: true,
    keys: ["Winnie", "Winifred", "death", "stairs"],
  }),
  starterNote("The Last Resort — The Boarder", "secret", SECRET_BOARDER, {
    secret: true,
    keys: ["Boarder", "boiler", "Room 0", "Sunday plate", "basement"],
  }),
  starterNote("The Last Resort — The song", "secret", SECRET_SONG, {
    secret: true,
    keys: ["song", "Last Dance", "Delphine", "gramophone", "Silver Room"],
  }),
  starterNote("The Last Resort — What Gideon is hiding", "secret", SECRET_GIDEON, {
    secret: true,
    keys: ["Gideon", "Corbin", "Vane", "buyer"],
  }),
  starterNote("The Last Resort — Bookings this week", "table", T_BOOKINGS, {
    keys: ["booking", "Bookings this week"],
  }),
  starterNote("The Last Resort — Guests", "table", T_GUESTS, {
    keys: ["guest", "Guests"],
  }),
  starterNote("The Last Resort — What the dead did last night", "table", T_DEAD, {
    keys: ["last night", "the dead"],
  }),
  starterNote("The Last Resort — Room trouble", "table", T_ROOMS, {
    keys: ["room trouble", "room"],
  }),
  starterNote("The Last Resort — Town faces", "table", T_TOWN, {
    keys: ["town face", "Cutler's Bend"],
  }),
];
