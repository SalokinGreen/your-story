# Blood & Bone E5: two campaign starters, Grave Watcher and a haunted hotel

Status: **design, waiting for the author's approval.** Nothing is built.
Decisions 163–172 (the interview of 2026-10-24, and the author's notes on the first drafts). The expansion roadmap is
`docs/bb-expansion-design.md` §6 (E5: "Starters, built on everything above").
This document replaces that row's "three or four new ones in different cities"
with the two the author asked for.

## 1. What the author asked for

> "An adventure similar to haunted hotel and another one called Grave Watcher.
> It's in a world where the supernatural was normal and there are Grave
> Watchers like Firewatchers but they keep watch on huge graveyards because it
> attracts dark magic. It would be a cool small town close to it where most of
> the social contact is happening and the players communicate with other GW
> over their radios. The tower is their personal head quarters. We will have a
> roster of grave watchers for players to play as or add to the team as NPCs
> if they are alone or just two."

The interview settled the rest:

| | Grave Watcher | The hotel |
|---|---|---|
| Rules | Blood & Bone, Masquerade off (163) | Blood & Bone (the Masquerade stays, but local and leaky; §4.2) |
| Who you play | Any Kind or a human Watcher, from a roster (164) | The family who inherit the hotel; human by default, any Kind allowed (168) |
| Inspiration | The author's own idea | The premise and tone of Netflix's *Haunted Hotel* (165); nothing of its names, characters or rules (decision 3) |
| Tone | Slice of life (171): a small-town life sim with quick, warm talk; the yard is real but in the background | Comedy-horror (167): funny and warm, real scares and real stakes |
| Length | A campaign (166) | A campaign (166) |
| Where | America, its own world: a valley town by the graveyard (169) | America, its own small town (169) |
| Era | Today, analogue: radios, logbooks, bad signal (170) | Today |

## 2. What a starter is, today

A starter is a `BuiltinAdventure` in the system's `starters` list
(`app/misc/systems/blood-and-bone/index.ts`), like *The Hollow Hour*
(`hollowHour.ts`). Its `storyTemplate` carries:

- copies of the pack notes it uses, each with its built-in id as
  `libraryNoteId` (that is how `resolveSystem` knows the story runs Blood &
  Bone and offers the system tools);
- a short `dm_instructions` note, "<Title> — Running it", pinned in full with
  the core every round (the two together must stay under the 4,000-token
  DM-instructions cap; the core is 2,380, so a Running-it note has about
  **1,500 tokens**);
- secrets (`type: "secret"`, `visibility: "hidden"`), NPCs, meters and
  progress tracks, and `sessionZeroActive: true`.

New for E5, from what is already in the engine:

- **Pre-made characters are presets** (`StoryData.presets`, `Preset.characterSheet`).
  When an adventure has any, the preset picker shows before play
  (`hasPremadeCharacters`), and a player with a pre-made sheet skips the
  character steps of session zero (`setup.premadeFor`, decision 148).
- **A campaign is written by the GM in session zero**, from a campaign note
  the starter supplies (the `gm_plan` spine, `campaignPlan.ts`, medium preset:
  seven beats). The starter does not ship a `gm_plan` note: session zero's
  Campaign step needs the GM to write one, and the player approves it on the
  setup card.

## 3. Grave Watcher

### 3.1 The world, in one paragraph

Everyone knows the dead don't all stay down. The things that walk at night
are neighbours, with licences and night shifts. What nobody likes is the
**yards**: the great old cemeteries, some of them a hundred thousand graves
across a valley, where enough grief and old burial pools to draw dark magic
the way a low field draws water. Bad workings take root there. Graves open.
Things come up that were never buried. So every great yard has a **Grave
Watch**: a ring of lookout towers, one Watcher (or a pair) to a tower, a
radio net, a logbook, and the town down the road where they buy coffee and
drink on their nights off.

### 3.2 The places (one lore note each)

- **The Long Acre** (working name): the yard. Two hundred years of graves
  over a valley and its ridges; sections with names (the Paupers' Field, the
  Catholic Rise, the Children's Hill, the Drowned Ground by the reservoir, the
  Old Lot nobody has the records for). Fog sits in it. Some sections have
  rules (never answer a voice on the Children's Hill; leave salt at the
  Drowned Ground gate).
- **The tower**: the players' headquarters. One room on stilts above the
  trees: the bunk, the stove, the radio, the logbook, the spotting scope, the
  fire-finder plotting table with the yard's map, the ward-lamps on the
  rail. What's in it is listed so the GM can put it to use.
- **The town**, a small valley town (working name **Hollins Ferry**): the
  diner, the bar, the hardware store that sells salt by the sack, the chapel,
  the sheriff, the funeral home, the motel. Where the social life is.
- **The Watch net**: the other towers (six to eight, each with a call sign
  and a voice: the veteran who has done thirty seasons, the new kid, the one
  who never sleeps, the tower that went quiet last year), the dispatcher in
  town, the radio etiquette (call signs, "say again", the check-in every
  hour after dark), and what a dead channel means.

### 3.3 Masquerade off: how the rules change (decision 163)

The core rules stay. Three things in them assume the Masquerade, and the
Running-it note rereads them for this world:

| B&B as written | In Grave Watcher |
|---|---|
| **Exposure** (per character, 0–6): mortals noticing what you are | **Taint** (per character, 0–6): how much of the yard's dark has got into you. +1 for: a miss that touches a working; staying in the yard past dawn; a grave opened by your hand; a Power used in the yard on a miss. Thresholds: 3 the dogs in town won't come near you; 5 the dead start talking to you by name; 6 the yard keeps you. Clean Up becomes cleansing (salt, running water, a night in town), which lowers Taint by 1. |
| **Heat** (world, 0–6): the city's attention | **Unrest** (world, 0–6): how restless the yard is. Rises when a working is left to grow, a grave is robbed, a Watcher abandons a tower; falls when a working is broken or a section is laid quiet. 3 the dead walk on ordinary nights; 4 the county sends an inspector and threatens to bring in the Board; 5 the town is in danger; 6 the yard breaks its fences. |
| **The Mask Slips** (a Success-at-a-Cost option): Exposure +1 | **The Dark Takes Hold**: Taint +1. |

The Concord, the Vigil and the Masquerade do not exist here; there is a
**Board of Wardens** (the county body that runs the Watch and its rules) and
people who rob yards for what's buried in them.

Meters are made by the starter, as *The Hollow Hour* makes Heat
(`createMeter` with the starter's own definitions): Taint per Watcher and
Unrest for the world. The system's "Blood & Bone character" set still gives
Stress, Beast and XP; its Exposure meter is left at 0 and the Running-it note
says it is not used. **No change to the system's meter sets.**

### 3.4 The roster (decision 164)

**Eight Watchers**, each a preset with a complete sheet (Kind, Archetype, stats,
Path, a Power, a Vow, two Connections, a Burden, gear) and a tower:

- a human veteran (thirty seasons, bad knees, knows every section by its smell);
- a Ghost who died on the job and kept the post;
- a Gargoyle who came with the oldest tower and has never left it;
- a young human on their first season, there for the money;
- a Witch/Warlock who reads the fog;
- a Werewolf who runs the fence line on full moons;
- a Revenant who came back for something buried in the Old Lot;
- a Rusalka who keeps the Drowned Ground.

**Solo or two players:** the player(s) pick from the roster (or build their
own in session zero); the Running-it note tells the GM to fill the team to
three or four from the rest, as NPC Watchers on the radio and in the next
tower, with their sheets in a "Roster" note so they can be handed to a player
who joins later. Couch co-op and party mode: each player picks one in session
zero (the GM offers them with `ask_question`, `target_player_name`), and the
GM writes each as that player's "Character: <name>" sheet.

### 3.5 What play is: a small-town life, with a graveyard at the end of the road (decision 171)

The author, after reading the first draft: "Grave Watcher has to be a bit
more slice of life, life sim, Gilmore Girls vibe." So the town is the show
and the Watch is the job. Most of a session is life in Hollins Ferry: the
diner, the people, who is seeing whom, who is not speaking to whom, the
town meeting that runs two hours over a parking space, the festival that
needs a volunteer, a mother and a grown daughter who are each other's best
friend and worst critic, the coffee. The talk is quick, warm and funny, and
everyone knows everyone's business. The yard is real and dangerous, but it
is the weather of the place, not the plot of every scene.

**The rhythm.** The season runs on the **town calendar**, not on monster
nights:

- **A day** is town: errands, a shift somewhere (most Watchers have a second
  job; the Watch pays badly), lunch at the diner, a favour someone asks, a
  date, an argument, a town meeting. The GM plays the town as a cast of
  regulars with running bits.
- **A night** is a watch: the radio check-ins (most of what comes over the
  net is gossip, jokes, music requests and someone's dog), a quiet logbook
  entry, and now and then a call that means going down the ladder. Most
  nights nothing comes up out of the ground, and the conversation on the
  radio *is* the scene.
- **The calendar**: one town event every week or two, which the campaign is
  built around: the Founders' Day pancake breakfast, the Lantern Walk through
  the yard's old section, the dance marathon, the Halloween committee (a
  sore subject in a town like this), the first snow, the winter carnival,
  the spring cleanup of the graves. Each event is a social scene first and,
  sometimes, a trouble in the yard second.

**What the dice are for.** The B&B moves cover both halves. *Compel*, *Gather
Information* and *Secure an Advantage* do most of the work in town (winning
the argument at the town meeting, finding out who sent the anonymous pie,
getting the booth at the diner), and Connections are the heart of the
character: the Running-it note tells the GM to give every Watcher a life in
town worth losing, to bring their Connections into scenes often, and to let
a Connection rise or fall from a good conversation. Stress comes from the
yard *and* from life (a fight with your mother counts). *Face Danger* and
the Skirmish moves are for the nights that go wrong.

**The campaign underneath** is slow and mostly in the background: a working
growing somewhere in the Long Acre, the tower that went quiet last year, and
who in town profits from a restless yard. It surfaces through town life (the
funeral director's new car; the Founders' Day speech that mentions the Old
Lot; the dog that won't walk past the diner's back door) more than through
the radio.

- **The campaign note** gives the GM the season for its seven-beat plan, laid
  over the calendar: each beat names the town events it falls between.
- **The town is the biggest part of the material** (decision 172): three
  layers of people, so the town feels full and the GM never has to invent a
  face from nothing.
  - **Twenty-five regulars**, the cast: people the Watchers see every week,
    each an NPC with a running bit, a want and a relationship to the Watch
    (the diner's owner, who refuses to put in Wi-Fi; the town selectman, who
    runs every meeting like a war; the dispatcher, who knows everything
    first; the funeral director; the sheriff; the hardware store's two
    feuding brothers; the dance teacher; the town's one Vampire, who runs the
    night shift at the pharmacy; the ghost who still sings at the chapel; the
    Board's inspector, who comes up from the county and is, unfortunately,
    charming; and fifteen more). They are the starter's NPCs and a "Town
    regulars" note the GM reads.
  - **Thirty-five occasional visitors**: people who turn up every few weeks
    or once a season (the travelling knife-sharpener, the mourners who come
    every November, the county librarian's bookmobile, the woman who sells
    honey at the festivals, the college kids who come to see the yard on a
    dare, a Watcher from another yard on leave). A line or two each, with a
    when ("every second Tuesday", "at the first snow") so the calendar can
    bring them in. Two notes, "Occasional visitors" A–Q and R–Z, to stay
    under the read cap; they become NPCs only when the GM brings one in.
  - **A hundred kinds of people you might meet** (d100): a table of types,
    not named people, for the stranger at the gas station or the face in the
    crowd at the Lantern Walk: "a hearse driver on his lunch break", "a
    Werewolf family on a road trip, all asleep in the van but the dad", "a
    retired Watcher who still checks the sky at dusk". The GM rolls, names
    the person (or rolls the Names table) and plays them.
- **Tables** (the starter's own; the Europe-flavoured E1 tables are left out,
  §5): Town today (d20: what is happening on Main Street), Who's at the diner
  (d20), Gossip going round (d20), The radio net tonight (d20, mostly not
  monsters), Calls on the radio (d20, the ones that are), People you might meet (d100, above), Names (d100 first names, d100 family names), What stirs in the
  yard (d20), Sections and graves (d20 + a d66 of inscriptions), Weather and
  the fog (d20).
- **Unrest climbs slowly**: it starts at 1 and moves with the campaign, not
  with every night, so a session can be all town and still be the game.
- **Shared tracks**: "Get through the season" (a long track the calendar
  marks), and one for the arc's working. Each Watcher's Vow is personal and
  usually about someone in town.

**Another sample, a day.**

> Marisol has put the coffee in front of you before you've sat down, which
> means she wants something. "Two things," she says. "One: Founders' Day.
> Walt has signed you up for the pie table, don't look at me, I said you'd
> hate it. Two." She lowers her voice. "The new guy at the funeral home paid
> cash for the Hendricks place. *Cash.* Who has cash?" Behind her, Walt
> Pruitt is taping a sign to the door that says TOWN MEETING TONIGHT and,
> underneath, smaller, PARKING.

## 4. The hotel (working title *The Last Resort*)

### 4.1 The premise

Somebody in the family died and left you a hotel. It is in a small town in
the hills, it is in debt, and it is full of the dead: guests who checked in
and never left, staff who never clocked off, and something in the boiler room
that the will asked you, in writing, not to feed. You have one season to
make it pay, or the bank takes it, and the dead have opinions about that.

What is borrowed from the show is only the **shape**: a family inherits a
haunted hotel, runs it with its ghosts, and the comedy and the horror come
from the same place. The family, the ghosts, the town, the hotel, the thing
in the basement and every rule of how the dead work here are original
(decision 3). Nothing is named after the show's characters, places or
episodes.

### 4.2 How the rules change

The Masquerade stays, **local and leaky**: the town half-knows and doesn't
talk about it, and the paying guests must not find out. That makes Exposure
the comedy engine:

- **Exposure** (per character) stays as written: the guests noticing.
- **Heat** becomes **Vacancy** (world, 0–6): how close the hotel is to
  closing. It rises with refunds, bad reviews, a guest who runs screaming, a
  bill not paid; it falls with a full house, a wedding that goes well, a
  review that says "charming". 3 the bank sends a letter; 4 the bank sends a
  man; 5 a buyer is circling; 6 the doors close.

### 4.3 The family (the roster, decision 168)

**Five relatives**, each a preset with a sheet: the one the will named (in
over their head), their teenage kid (who can hear the dead), their younger
kid (who has started a club with one of the ghosts), the relative who died
and left the hotel (playable as a Ghost; the reason they died is a secret the
campaign opens), and the in-law who came along to help and is hiding
something. Human by default; any Kind allowed. Solo and two players fill
the family the same way as the Watch (§3.4).

### 4.4 What play is

A season in the hotel, in **weeks**: each week a booking (a wedding, a
convention, a ghost-hunting TV crew, a guest who asks for a room that isn't
on the plans), a problem with the dead, and the bills. Under the weeks: why
the relative died, what the will kept out of it, and the thing in the boiler
room.

- **The residents**: about eight ghost NPCs, each with what they want, a room,
  and a rule (one only appears in mirrors; one is still working the front
  desk; one is a party that never ended in the ballroom).
- **Tables**: Bookings this week (d20), Guests (d20), What the dead did last
  night (d20), Room trouble (d20), Town faces (d20).
- **Tracks**: "Keep the doors open" (the season) and "Why did they die?".

## 5. The engine change: a starter's setting

On load, `addMissingBuiltinNotes` (`app/misc/systems/builtinNotes.ts`) adds to
every Blood & Bone story the Rules notes and the `cross-europe` notes it has
not been offered. A starter is seeded with every id it would be given, so a
note the starter left out never arrives, **but a note shipped later would**:
a new Europe by Night note would reach a Grave Watcher story.

- `SystemState.setting?: string` (`structs.ts`): Grave Watcher is
  `"grave-watch"`, the hotel `"last-resort"`, and absent means Europe by
  Night (every existing story and *The Hollow Hour*). The starter's
  `storyTemplate.systemState` carries it, so a story started from it, or
  from a copy opened in the Designer, has it from the first save. (Check in
  S1 that the Designer's draft keeps `systemState`; if it drops it, the
  draft gains the field.)
- `pushedBuiltinNotes` pushes the `cross-europe` notes only to a story whose
  setting is Europe by Night. Rules notes still reach every story.
- Tests in `tests/systems.builtinNotes.test.ts`: a Grave Watcher story is not
  given a new cross-Europe note; a Hollow Hour story still is.

**The Rules notes each starter copies:** the mechanics (the core, moves,
Kinds, Archetypes, assets, progress, time skip, creation, creation prompts),
the miss tables and the three oracles. **Left out:** the twelve E1 table
families (People, Places, the Concord, the Vigil, the Masquerade, the Hollow
Roads and the rest): they are Europe by Night's, and each starter brings its
own. The Running-it note says the core's table list does not apply and names
the starter's tables. A Rules table shipped later still reaches these
stories; that is acceptable, since a later Rules note is meant for every
setting.

## 6. Size

| | notes | tokens (estimate) |
|---|---|---|
| Grave Watcher: Running it, campaign, the calendar, the yard, the tower, the town and its places, the net, roster, town regulars, two visitor notes, 10 tables (two d100), 2 secrets, 25 regular NPCs, 8 presets | ~25 | ~28,000 |
| The hotel: Running it, campaign, hotel, town, residents, family, 5 tables, 2 secrets, ~12 NPCs, 5 presets | ~14 | ~13,000 |

Every note under the 2,500-token read cap; each Running-it note plus the core
under 4,000.

## 7. Slices

1. **S1, engine:** the setting field and the push rule (§5), with tests.
   Engine review.
2. **S2, Grave Watcher** content (`app/misc/systems/blood-and-bone/starters/grave-watcher/`),
   wired into `starters`; tests: note sizes, the cap, the preset sheets fill
   the B&B sheet's fields, the table headings pass `checkTableShape`, the
   starter's own meters exist.
3. **S3, the hotel**, the same way (`.../starters/last-resort/`).
4. **S4:** docs (CLAUDE.md, the expansion design's §6 row, pending checks),
   a devlog with the preview and desktop screenshots (the Library card, the
   preset picker, a session zero with a pre-made Watcher), and the APK.

One PR. Content is written by Claude workers from a brief and read by the
author in the reading copy before merge (decision 157).

## 8. Samples: the voice (approve these with the design)

**Grave Watcher, the intro.**

> The radio wakes you before the alarm does. "Nine, this is Four. Nine, you
> up?" The stove has gone out. Below the tower the Long Acre is a sea of fog
> with headstones standing in it like people waiting for a bus, and out past
> the Catholic Rise there is a light where no light should be: low, green,
> moving slowly between the graves the way a person walks when they're
> looking for a name. "Nine. Four. I've got it too. You going down, or am I?"

**A Watcher from the roster.**

> **Dolores "Dee" Harjo**, Tower Two. Human, Hunter (the Pragmatist). Thirty-one
> seasons. Knees gone, eyes not. Knows every section by the way its fog
> smells, and has a rule for each one written on the inside of her tower's
> door. *Vow:* find out who walked out of the Old Lot in '94 wearing her
> husband's coat. *Connection:* Marisol at the diner, who keeps her a booth.

**The hotel, the intro.**

> The lawyer leaves before you have finished reading the will, which is the
> first bad sign. The second is the hotel's bell, ringing by itself at the
> empty front desk. The third is the old man behind it, who was not there a
> moment ago and is see-through at the edges. "Checking in?" he says, and
> then, looking at your face: "Oh. Oh, you're *family*. Well. Nobody tell the
> basement."

**A resident.**

> **Mr. Ambrose Pell**, the front desk. Died in 1961 at his post and has not
> taken a day off since. Polite, tireless, appalled by the new card machine.
> *Wants* the hotel run properly, which means the way it was in 1961. *Rule:*
> he cannot leave the lobby, and he cannot lie about a room.

## 9. What this does not do

- No new system, meter set, move or Power; both starters run on Blood & Bone
  as it is, with the starter's own meters.
- No changes to Europe by Night or *The Hollow Hour*.
- No art; pictures in play can paint them.
- The hotel's name, the yard's name and the town's are working titles: the
  author can rename them in review.

## Decisions made during implementation (2026-10-24)

- **Status: approved ("Go", decision 173) and built** on `claude/bb-starters`.
- **The setting lives only in `storyTemplate.systemState.setting`**, not on
  `BuiltinAdventure`: the template is spread into the new story, so no new
  field was needed there. The Designer's draft keeps it (`designer_executor.ts`).
- **Tower Nine** is the players' tower: a roster Watcher picked by a player
  crews it this season, and Towers One to Eight hold the rest of the roster as
  NPCs on the radio. Tower Six "went quiet last year" and is now held by the
  Revenant Emmett Roake, who took over the post.
- **Human player characters are Hunters** (Blood & Bone has no human Kind):
  the hotel's family and the human Watchers are Hunters by Kind, with the
  Pragmatist, Zealot or Penitent Archetype.
- **The hotel's buyer** was renamed Corbin & Vane Hospitality so its name
  does not echo Grave Watcher's Walt Pruitt.
- **Size, as built**: Grave Watcher about 20,000 tokens of its own notes
  (16 world notes and tables, the roster, the regulars, two visitor notes,
  five town tables), The Last Resort about 10,000 (14 notes and the family).
