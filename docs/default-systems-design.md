# Default RPG systems — design

**Status:** draft for the author's review, 2026-10-22. Nothing here is
approved to build. Decisions 62–77 in [`decisions.md`](decisions.md). The
implementation plan is a separate document, written after this one is
approved (`workflow.md` Phase 3).

## 1. What this is

A **default system** is a ruleset that ships with the app, written so the AI
GM can run it well out of the box. The first is **Blood & Bone** (B&B), the
author's own modern-supernatural game on the Ironsworn engine: a d6 plus a
stat against two d10s; Stress, Beast and Exposure meters; progress tracks;
a three-roll skirmish; a d6 miss table for every move (decision 62).

The design has three parts:

- **The format** (§3): what a default system is made of, how its notes reach
  the GM, and how it ships: a pre-installed notes-library pack plus a starter
  adventure (decision 63).
- **The engine** (§4): generic meters, progress tracks, a tally mode for
  challenges and a session boundary, so the arithmetic these systems need is
  done by code, not by the model (decisions 64, 66, 67).
- **Blood & Bone's AI edition** (§5): the book's rules repackaged for the GM,
  with every gap closed, split into notes that fit the prompt.

**Why.** Today the GM improvises mechanics from whatever notes an adventure
has. An author who brings a rulebook imports it through the PDF importer,
which writes book-length rules notes with no size cap, and the GM reads them
whole or not at all (status report §6.15). A rulebook written for people also
leaves numbers to the GM's judgment, which an AI GM fills in differently on
every turn. A default system is the opposite: a small core always in front of
the GM, everything else fetched when needed, every number stated, and every
piece of arithmetic done by the engine.

## 2. Out of scope

- **Other systems** (decision 62). The format is built for more, but only
  Blood & Bone is designed here.
- **A system picker** (decision 63). Systems are packs and adventures, not a
  mode the app switches into.
- **Changing how notes load** (decision 72). Rules notes stay titles-only;
  the core goes in a note type that is already pinned.
- **The four bugs in status report §6.15–6.18** (decision 65). They are
  planned separately. §5.6 names the one this design leans on (§6.17).
- **Online-play secrecy** (§6.12). Guests already receive the whole
  `StoryData`; meters and tracks are not secret, so nothing here makes that
  worse.
- **Live-model testing before the edition is playable** (decision 76).
- **Reworking the director, the Observer or the Mythic oracle.** §6 lists
  where they meet Blood & Bone, as things to watch in playtests.
- **Art, logos and trade dress** from Ironsworn or anywhere else.

## 3. The format of a default system

### 3.1 What a system is made of

What the GM sees of a note depends only on its `type` (status report §6.15):
`dm_instructions`, `character_sheet` and `gm_plan` notes go in full into
every round, never truncated; every other type is listed by title for the GM
to open with `read_notes`, which returns the whole note. Nothing caps a
note's size. So a system is built from these pieces:

| piece | note type | how the GM gets it | budget |
|---|---|---|---|
| **Core rules** | `dm_instructions`, titled "*System* — Core rules" | in full, every round | **≤ 3,000 tokens** |
| **Reference notes** | `mechanics`, one topic each | title in the prompt; `read_notes` when a rule comes up | ≤ 2,500 tokens each |
| **Tables** (miss tables, oracles, creation prompts) | `table` | title; read, then rolled with `formula_roll` | as written |
| **Character sheet** | a template in `CHARACTER_SHEET_PRESET_TEMPLATES`, filled into a `character_sheet` note | in full, every round | ≤ 1,000 tokens filled in |
| **Meters and tracks** | engine data (§4), defined by the pack | a compact section of the state block | one line each |
| **Setting** (optional, its own pack) | `lore`, `secret` | titles; read on demand | as written |
| **Starter adventure** | an `Adventure` built on the packs | — | — |

Why `dm_instructions` for the core: it is the pinned type meant for guidance
to the GM. The core is GM procedure, and a `character_sheet` note belongs to
one player. Reference notes stay `mechanics`, so they cost a title each until
the GM opens one.

**The budget is measured, not guessed.** Every request already carries about
22,000 tokens before any note or history: a 6,221-token system prompt and
15,841 tokens of tool schemas (measured with the app's own estimator,
cl100k). The Memory Size default is 36,000 and the history half of it is
enforced, but the pinned notes are not (§6.15), so a system's pinned text is
paid on every round of every turn. Three thousand tokens is about the book's
own one-page quick reference (860 tokens) plus the tool procedures and the
AI-edition rules. A test checks every budget in this table (§8).

### 3.2 Rules for writing a system the GM can run

These are what make a rulebook into a default system. They apply to every
system, not only Blood & Bone.

1. **Every number is stated.** No "your Stress spikes", no "the Ledger
   fills": how much, how often, at what size. Where the book leaves a number
   to the table, the AI edition picks one (decision 73) and says so.
2. **Every trigger has an amount and a frequency** (decision 70 is the model:
   +1, each distinct trigger at most once a scene).
3. **Each rule names its tool.** The core says which tool does what
   ("record a skirmish roll with `record_challenge_result`"), so the GM never
   has to infer a procedure.
4. **The core says which built-in tools not to use** when the system
   replaces them (for Blood & Bone, the combat tools: antagonists have no
   sheets and never roll).
5. **Note titles are unique and say what is inside.** The GM opens notes by
   exact title. The core names the note to read for each situation ("on a
   miss, read *B&B — Miss tables: generic moves*").
6. **No copied text** (decision 3). Mechanics are not protected; wording is.
7. **The core is written for the GM, the reference notes for lookup.** The
   core carries procedure and principles; examples, flavour and design notes
   stay in the author's book.

### 3.3 How a system ships

- **In the repository, as source.** Each system lives in
  `app/misc/systems/<system-id>/`: its notes, tables, character-sheet
  template, meter and track definitions, and its starter adventure, as
  TypeScript modules. Being source means it is in the static export the
  native apps package, with no fetch at runtime, and the suite can test it.
  (The repo is public, so this publishes the AI edition's text; §7.)
- **Two packs in the notes library** (decisions 63, 75): *Blood & Bone —
  Rules* and *Blood & Bone — Europe by Night*. They appear in the notes
  library on first run as built-in packs. The Designer imports them into an
  adventure with the existing `importFromLibrary` and `LibraryPickerModal`;
  the in-story lore editor can do the same.
- **A starter adventure in the adventure library:** *The Hollow Hour*, built
  on both packs, which a player can start straight away or open in the
  Designer.
- **Updates.** A built-in pack carries a version. A newer app replaces the
  library's built-in copy and never touches notes already imported into an
  adventure or a story: those belong to the author or the player.
- **The Designer** learns that built-in packs exist and what each contains,
  so it can offer one when an author's adventure needs rules.

*To be completed when the code exploration reports back: how the notes
library stores notes and folders, whether a seed hook exists, and how a
built-in adventure would appear in the library.*

## 4. The engine: meters, progress tracks, tallies, sessions

### 4.1 Why in the engine

"LLM proposes, deterministic engine disposes." Blood & Bone runs on numbers
that change every few turns: Stress 0–6 with a cap that drops as the Beast
climbs; Beast 0–10, which only rises; Exposure 0–6; the Witch's Ledger;
Heat for the city; progress tracks of ten boxes and four ticks, marked by
rank. Kept as prose in the character sheet, every change is the model
rewriting a line of text, and the clamps, caps and tick arithmetic are its to
get wrong. Today nothing in the engine holds a number the GM can raise and
lower: countdown timers only count down, and challenges are first-to-N with
a binary outcome. So the engine gets generic versions of both, usable by
any system (decision 64).

### 4.2 Meters

A **meter** is a named number owned by a character or by the world.

| field | meaning | Blood & Bone example |
|---|---|---|
| `name` | unique per owner | "Stress" |
| `owner` | a character, or the world | the player's character; "world" for Heat |
| `min`, `max` | the full range | 0, 6 |
| `cap` | the current ceiling, ≤ `max` | 6, then 5 at Beast 6, 4 at Beast 9 |
| `floor` | the current floor, ≥ `min` | 0, then 1 at Beast 9 |
| `value` | | 2 at creation |
| `thresholds` | labels at values, reported when crossed | Exposure 3 "Attention", 4 "Pressure"… |
| `resets` | optional: back to a value at each scene or session | a once-per-night ability: 1 → 0 |
| `onlyUp` | optional: the value may never fall | Beast |

One tool, **`manage_meter`**, with actions `create`, `adjust` (by an
amount), `set`, `set_cap`, `set_floor` and `remove`. The engine:

- clamps every change to `[floor, cap]` and reports `old → new`, including
  how much of a change was clamped away;
- refuses a fall on an `onlyUp` meter;
- reports each threshold crossed, and reaching the cap, in the result (the
  GM learns "Stress reached its cap" from the engine, not from arithmetic);
- **deduplicates by key:** an `adjust` may carry `once_per: "scene" |
  "session"` and a `key` ("sunlight"). A second adjust with the same meter,
  key and scope inside the same scene or session is refused with the reason.
  This is how decision 70 (+1, each trigger once a scene) and the book's
  "each XP trigger pays once per session" are enforced by code;
- refuses an unknown meter name with the list of the owner's meters.

### 4.3 Progress tracks

A **progress track** is Ironsworn's: ten boxes of four ticks, marked by rank.

| field | meaning |
|---|---|
| `name`, `owner` | as meters |
| `kind` | `vow`, `condition`, `enemy`, `journey` or `other`, for display and for the GM's reading |
| `rank` | troublesome, dangerous, formidable, extreme, epic: 12, 8, 4, 2 or 1 ticks per mark |
| `ticks` | 0–40 |
| `status` | active, fulfilled, forsaken, cleared |

One tool, **`manage_track`**, with actions `create`, `mark` (times, default
one; the engine adds ticks by rank and clamps at 40), `progress_roll`,
`set_status`, `halve` (the book's "progress reduced to half its boxes,
rounded down"), `set_rank` and `remove`.

**`progress_roll` is the engine's.** It rolls two d10s against the filled
boxes (partial boxes don't count, ties go to the dice) and returns strong
hit, weak hit or miss, plus whether the dice matched. This is a deliberate
exception to "tools report what the dice showed and never judge": the
comparison is fixed entirely by state, with no difficulty for anyone to
choose, so there is nothing for the model to decide and nothing to fudge.

### 4.4 Tally challenges

Blood & Bone's skirmish is exactly three action rolls; a strong hit is +1
Advantage, a weak hit 0, a miss −1, and the final tally decides the fight.
`start_challenge` today is first-to-N successes or failures with a binary
outcome, and cannot express it.

So challenges get a **tally mode**: `start_challenge` with `mode: "tally"`
and `rounds` (3 for a skirmish); `record_challenge_result` takes
`strong_hit`, `weak_hit` or `miss`, adds +1, 0 or −1, and closes the
challenge after the last round, reporting the final tally. Existing
first-to-N challenges are unchanged.

This is how decision 67 (one roll per player turn) works: the challenge
holds the tally between turns, and the M2 roll gate, which already forces a
roll on every turn a challenge is active, makes each of the three turns roll
exactly once.

### 4.5 Sessions

The app has scenes (`increment_scene`) and turns, but no session. Blood &
Bone needs one for the Reckoning, downtime, once-per-session XP and dozens of
once-per-session abilities. Decision 66 makes a session one night in the
story, ending at dawn.

The engine gets a generic **`end_session`** tool and a `sessionCount`. It
increments the count, resets every meter whose `resets` is `session`, clears
the per-session dedup keys (§4.2), and returns the system's end-of-session
checklist from the core rules as a reminder. *When* to call it is the
system's to say: Blood & Bone's core says "at dawn".

The Reckoning itself stays a GM procedure with existing tools:
`formula_roll(["4d6"])` for Stress 4 reports every die, the GM counts the 1s,
and `manage_meter` raises Beast by that many. Automating the count is an
open question (§7).

### 4.6 What the GM and the player see

- **The GM:** a compact *Meters & tracks* section in the pinned state block,
  one line each ("Mira — Stress 3/6 (cap 6) · Beast 1/10 · Exposure 2/6
  (Rumour)"; "Vow: Find who is taking the bodies — dangerous, 3 boxes"). It
  costs a few tokens per line, which is far cheaper than the prose it
  replaces.
- **The player:** the same numbers on the character sheet during play, as
  bars and boxes.
- **Online guests:** they receive `StoryData` already, meters included.

*File-level details (which component shows the sheet, how characters are
identified for `owner`, every place a new tool is wired) follow the code
exploration.*

### 4.7 Cost

Every request carries every tool schema, about 15,800 tokens today. Two new
tools and a wider `start_challenge` add roughly 1,000–1,500 tokens to every
request of every adventure, Blood & Bone or not. The recommendation (an open
question in §7) is to offer `manage_meter`, `manage_track` and `end_session`
only to stories whose adventure declares it uses them, which a pack sets when
imported and the Designer can set by hand.

## 5. Blood & Bone: the AI edition

### 5.1 What it is

The book stays the author's: a 58,000-token rulebook (measured, cl100k) for
people at a table. The AI edition is the same game repackaged for the GM:
the same rules, every gap closed (§5.4), adapted to the app's turns and tools
(§5.3, §5.5), split into notes that fit the prompt (§5.2), with the copied
sentences rewritten (§5.8). Every subsystem stays in for now; whatever the GM
handles badly in playtests is cut or simplified then (decision 74).

### 5.2 The notes, with measured sizes

Sizes are the book's current text for that material, measured with the
app's estimator; the AI edition's notes will be tighter.

| note | type | from the book | tokens now |
|---|---|---|---|
| **B&B — Core rules** | `dm_instructions` | Ch. 1, 3, 4, 5, 6, 11, 12, 13, 14, App. C, condensed, plus §5.3–5.5 | target ≤ 3,000 |
| B&B — Moves | `mechanics` | Ch. 8 generic moves, Clean Up, Burn a Connection, Resist the Hunger (§5.4) | ~1,500 |
| B&B — *Kind* (×7: Vampire, Gargoyle, Wendigo, Werewolf, Witch/Warlock, Hunter, Ghost) | `mechanics` | the Kind's entry, its two archetypes, its Beast track, its Powers (Ch. 2, 3, 9) | ~1,700–2,300 each |
| B&B — Paths · Havens · Companions · Relics · Rites | `mechanics` | Ch. 10, one note per asset type | ~1,500–1,700 each |
| B&B — Time Skip and the Turning | `mechanics` | Ch. 2 "The Turning", Ch. 3 Time Skip and Choosing Your Fate, assets and powers after a Time Skip | ~1,800 |
| B&B — Progress, vows and XP | `mechanics` | Ch. 11 in full, downtime actions | ~1,500 |
| B&B — Character creation | `mechanics` | Ch. 7 steps 0–8 and the quick-build table; read during session zero | ~2,000 |
| B&B — Miss tables: *group* (×4: generic moves, beast and recovery, skirmish and making, masquerade and recovery) | `table` | Ch. 16 | ~2,400 in all |
| B&B — Oracles: complication · scene · what they want | `table` | Ch. 15 (the yes/no oracle dropped, decision 68) | ~600 in all |
| B&B — Creation prompts: *Kind* (×7) | `table` | Ch. 7 guided creation oracle | ~1,100–1,300 each |
| **Setting pack:** Europe by Night — overview, and one note per city (×6) | `lore` | Appendix A | ~200–350 each |
| **Starter:** The Hollow Hour | adventure | Appendix D | ~1,150 |

Not carried into the edition: the book's worked examples, the example of
play, the design notes and the glossary. They teach people; the GM has the
rules themselves.

### 5.3 Adaptations already decided

- **A session is one night; the Reckoning comes at dawn** (decision 66).
  When dawn arrives in the fiction, the GM calls `end_session`, runs the
  Reckoning, and offers the two downtime actions. Once-per-session means
  once per night.
- **A Rule of 3 fight is one roll per player turn** (decision 67), on a
  tally challenge (§4.4). The player says what they do and which stat it uses
  each turn; the engine holds the Advantage.
- **Yes/no questions go to Mythic's `fate_question`** (decision 68). The
  book's other oracles and the miss tables become table notes.
- **Stress from a Kind's trigger is +1, each distinct trigger at most once
  a scene** (decision 70), enforced by `manage_meter`'s scene key.
- **The Ghost's Fading starts at Stress 4+; 5+ for the Anchored, 3+ for the
  Unraveling** (decision 71).
- **The core is pinned; everything else is read on demand** (decision 72).

### 5.4 Proposed rules for the gaps (for the author to settle)

Decision 73: each of these is a proposal, with its reasoning, for the author
to accept or change in review.

1. **How far Stress "spikes": +2.** Used by *Feed the Beast* (a Skirmish
   cost) and a destroyed Familiar. A trigger is +1, so a spike is a step
   above it. From the starting Stress of 2, a spike puts the character at 4,
   where the Reckoning advances Beast 52% of the time (31% at Stress 2).
2. **The Witch's Ledger holds 10 marks.** Book prices run from 1 mark (a
   minor binding) to 5 (*The Deeper Pact*'s great act), so a 6-mark Ledger
   would fill on one big working. The book's "escalating marks" for a Sate
   ritual become: 1 mark for the first ritual of the night, +1 for each
   further ritual that night. The Hedge Witch pays 1 per ritual, never
   escalating; the Servant starts at 2 and escalates. When the Ledger reaches
   10, the source makes its demand and no working that costs marks is possible
   until it is met. Meeting the demand drops the Ledger to 5 ("clears
   partially"); with *The Clean Slate* it drops to 0. A typical night (one
   ritual, one or two marked powers) is 2–3 marks, so a base Witch hears from
   the source every three to five nights.
3. **The Wendigo's Slipping Mask is a 0–3 meter:** 0 steady, 1 strained,
   2 cracking (anyone who looks closely sees something wrong), 3 slipped (the
   human face is gone). It rises by 1 at each dawn of a night without a feed,
   and a Sate the Beast hit sets it to 0. The Graverobber's "advances one
   step faster" becomes +2 per foodless dawn. Under this rule the Predator's
   "resets the Mask fully" adds nothing, since every feed does; the author
   decides whether the Predator keeps that line or gets another.
4. **"The hunger only grows" (the Wendigo's weakness) is tied to the Beast
   Meter, not to a count of feeds.** "Starving", the Wendigo's Stress
   trigger, fires at the third foodless dawn at Beast 0–2, the second at
   Beast 3–5, and every foodless dawn from Beast 6. The book ties it to how
   many times the Wendigo has fed, which needs another counter and has no
   end; the Beast Meter already measures how far gone a character is and only
   rises. This is the proposal that departs furthest from the book's wording.
5. **Resisting the urge to feed is a move: *Resist the Hunger*.** When a
   feeding Kind at Stress 4 or more is close to vulnerable prey and does not
   mean to feed, or the GM says the Beast is pushing, roll +Heart. Strong
   hit: you hold. Weak hit: you hold, and Stress +1. Miss: the Beast wins;
   use the Sate the Beast miss table. The Abstinent's +1 and *The Held
   Line*'s +2 apply here (capped at +2 together). At Heart 2 that is 23%
   strong, 44% weak, 33% miss; with both bonuses, 45%, 40% and 15%.
6. **Resisting the Change gets its two missing outcomes.** Strong hit: you
   keep your shape all night. Weak hit: you keep it, but the change shows at
   a bad moment (claws, eyes, voice), or take Stress +1; you choose. Miss:
   its table, as written.
7. **Fights by rank.** A Troublesome enemy is one roll of the move that fits
   (usually Face Danger): a strong hit deals with them, a weak hit does too
   but with the skirmish's weak-hit cost, a miss pays the price and the fight
   becomes a Rule of 3. A Dangerous enemy is a Rule of 3, and a Decisive
   Victory ends them. Formidable and above are a Rule of 3 that marks their
   track, as the book says.
8. **The Fading's penalty.** At the threshold (decision 71), the Ghost
   chooses one: a stat counts as 0 for rolls, or a Connection can't be called
   on, until Stress drops below the threshold. *The Still Self*'s "steel
   yourself against the Fading" becomes "for the Fading's threshold, count
   your Stress as 2 lower", since there is no Fading roll and Steel the
   Resolve is the Hunter's.
9. **The Rogue's "Doomed-track complication"** becomes "a complication from
   your Doomed burden": Doomed is a burden, not a track.

### 5.5 How each rule maps to a tool

| rule | how the GM runs it |
|---|---|
| **Action roll** | `formula_roll(["1d6+<stat+adds>", "2d10"])`, then `calculate` once against each d10. The GM caps the score at 10 by hand and caps adds at +2. A match is the two d10s showing the same face (see §5.6) |
| **Progress roll** (Fulfil Your Vow, Clear a Condition, arrive on a journey) | `manage_track` `progress_roll` |
| **Marking progress** | `manage_track` `mark` |
| **Rule of 3** | `start_challenge` in tally mode, 3 rounds; one action roll per player turn; `record_challenge_result` with the outcome |
| **Stress triggers** | `manage_meter` adjust +1 with `once_per: "scene"` and the trigger as key |
| **Sate the Beast, Steel the Resolve, Stress relief** | action roll, then `manage_meter` |
| **The Reckoning** | at dawn: `end_session`, `formula_roll(["<Stress>d6"])`, count the 1s, `manage_meter` Beast |
| **Beast thresholds** | the engine reports Beast 3, 6, 9 and 10 crossings; the GM applies them with `set_cap`, `set_floor`, and an edit to the sheet for the lost stat point |
| **Exposure, Heat, the Ledger, the Slipping Mask** | meters with thresholds |
| **Conditions** | a track each (`kind: condition`), max three; the sheet names their scope |
| **Connections, Burdens, assets, gear** | prose in the character sheet |
| **XP** | a meter; each trigger adjusts it with `once_per: "session"` |
| **Once-per-night abilities** | prose in the sheet ("used tonight"), cleared at dawn when `end_session` reminds the GM. Moves to the engine only if playtests show drift (decision 74) |
| **Miss tables, oracles** | `read_notes` on the table, `formula_roll(["1d6"])` or `["1d10"]` |
| **Yes/no** | `fate_question` |
| **Antagonists** | rank and a progress track for Formidable and above; **never** `start_combat`, combatant stat blocks or `npc_roll`, since antagonists have no sheets and never roll |

### 5.6 The cost of an action roll, and a tool question

Each action roll as specified costs three tool calls across two rounds: the
roll, then the two comparisons in parallel. A miss adds a table read, a d6
and a meter change, so a missed roll can use five of the GM's ten rounds.
Rule of 3 at one roll per turn stays inside that; two rolls in one turn
would not.

The score's cap at 10 can't be written as `min(score, 10)`: `calculate` has
no functions, and the attempt silently returns a wrong number (§6.17). The
core tells the GM to cap by hand. Fixing §6.17 makes a mistake an error
instead of a wrong answer, but the cap is still manual.

The alternative is an **`action_roll` tool** for the Ironsworn family: stat
value and adds in, the engine caps adds at +2 and the score at 10, rolls,
compares, and returns strong hit, weak hit or miss, the dice and whether they
matched. One call instead of three, and the same comparison
`progress_roll` already does. It is a system-shaped tool, beyond decision
64's meters and tracks, so it is an open question (§7). Ironsworn, Starforged
and most of their hacks would use it, which matters if more default systems
follow (decision 62).

### 5.7 Names that collide

The GM opens notes by exact title, and several names in the book mean two
things. The note split (§5.2) keeps note titles unique, but the names still
appear inside notes, where the GM has to tell them apart. Proposed renames,
for the author:

| name | means | and also | proposal |
|---|---|---|---|
| The Reckoning | the end-of-session roll | a Rite (calling debts due) | the Rite becomes *The Calling Due* |
| The Vigil | the hunters' network | a Rite (sitting with the dead) | the Rite becomes *The Wake* |
| The Hollow | the Wendigo's Beast track | a Haven | the Haven becomes *The Forgotten Room* |
| The Turning | turning others (Ch. 2) | the Werewolf's Beast track | the track becomes *The Wild* |

### 5.8 The sentences to rewrite (decision 69)

These passages in the author's draft are near-verbatim from the Ironsworn
rulebook (checked against a 2019 copy; Starforged's prose was not checked).
They are named by place here, not quoted, so the repository does not carry
them. The replacements keep every rule.

| where in the draft | replacement |
|---|---|
| Ch. 1, *The Flow of Play*, opening paragraph | You see the night through your character. Most of play is saying what they do next and why: chasing a scent, keeping a promise, staying ahead of whatever is chasing them. When what they do is something a move covers, you turn to the move. |
| Ch. 1, *The Flow of Play*, the three outcome bullets | **Strong hit:** the moment is yours. You got what you went for, and you choose what happens next. **Weak hit:** you get it, but not cleanly. Something costs you or comes back at you, and your next move answers it instead of choosing freely. **Miss:** it goes wrong. The situation turns against you, and you'll be dealing with what it cost. |
| Ch. 1, *The Action Roll, In Depth*, first paragraph | Most moves call for the action roll: three dice thrown together whenever your character tries something that could go badly. |
| the same section, second paragraph | The move names the stat to add to the six-sided die ("roll +Shadow"), sometimes offering two to choose from. Circumstances can grant small extra bonuses, called adds ("add +1"). |
| the same section, the action-score paragraph | Your action score is the six-sided die plus the stat plus your adds. It tops out at 10: any higher total still counts as 10. |
| Ch. 1, *Resolving the Outcome*, first paragraph | Hold your action score up against each ten-sided die on its own. Only a higher score beats a die; a tie belongs to the die. |
| Ch. 1, *Paying the Price*, first paragraph | A miss usually ends with Pay the Price: the night takes something. The scene gets worse, a new danger arrives, or you lose something you'll feel — sometimes in the story alone, sometimes on your sheet as well. |
| Ch. 2, *Core Stats*, the opening sentences | Five stats describe what your character is good at and how they tend to solve problems. Each is rated from 1 to 3. |
| Ch. 2, *Core Stats*, the five stat descriptions (and the copies in Ch. 7 step 2 and Appendix B) | **Nerve:** quickness, guns, getting out of the way, keeping your head when everything moves at once, striking on instinct. **Heart:** resolve, compassion, how you reach people, and the humanity you are still holding on to. **Bone:** raw strength, taking punishment, and violence at arm's length or closer. **Shadow:** moving unseen, lying well, setting traps for people, hunting from the dark. **Wits:** what you know, what you notice, and thinking faster than whoever is across from you. |

The credits keep Tomkin Press's "This work is based on Ironsworn…" line,
add "not an official Ironsworn product", and drop "all text… original",
which was not true of these passages before the rewrite.

### 5.9 The character sheet

A Blood & Bone preset in `CHARACTER_SHEET_PRESET_TEMPLATES`, built from
Appendix B: name, Kind, Archetype, Path, the five stats, the Kind's Stress
triggers, Recover move and Weakness, Connections with ranks, Burdens, assets
with their bought abilities, gear, the three background answers, the XP
triggers in play (Archetype, Alternate or both, chosen at session zero), and
a "used tonight" line for once-per-night abilities. The numbers (Stress,
Beast, Exposure, Ledger or Mask, XP) are meters; Vows and Conditions are
tracks. Neither is written into the sheet's text.

### 5.10 Session zero and the starter

The app's session zero (the GM asks questions, writes the campaign plan,
calls `start_game`) carries the book's Step Zero and steps 1–8: the GM reads
*B&B — Character creation*, offers the Cohorts, walks the steps, rolls the
Kind's creation prompts when the player wants them, writes the sheet, and
creates the meters and the Vow tracks. *The Hollow Hour* is a starter
adventure on top of that: its premise, its three NPCs (Runa Sandhu, Callum
Reyes, Margot Severin) as NPCs and secrets, Heat starting at 3, its three
progress tracks, and its four endings as the campaign plan's spine. Session
zero still builds the characters.

## 6. Risks, and what to watch in playtests

- **Models and predation** (decision 76). The core loop rewards feeding and
  killing: 3 XP for draining a human, a Wendigo eating people. Some models
  soften or refuse those scenes, possibly including the default narration
  model, Mistral Small 3.2. This is the first thing to test once the edition
  is playable, on models the author picks.
- **Bookkeeping.** Even with meters and tracks in the engine, Connections,
  Burdens, ability uses and up to three Conditions' scopes stay with the GM.
  Watch for drift; decision 74 says what to do about it.
- **Tool rounds.** A missed roll uses about half of the GM's ten rounds
  (§5.6). Watch for turns that hit the cap.
- **The director.** Its pressure moves come with a rolled complication seed;
  Blood & Bone has its own complication oracle and miss tables. Two sources
  of complications may pile up.
- **The Observer's oracle check** flags turns that use none of
  `fate_question`, `roll_table` or `roll_portent`. Blood & Bone's tables are
  rolled with `formula_roll`, so expect advisory flags; they don't block.
- **Secrets.** Hidden notes reach the narrator (§6.16). Blood & Bone's
  starter keeps who turned Runa as a secret; until §6.16 is fixed, the
  narrator can see it.

## 7. Open questions for the author

1. **An `action_roll` tool for the Ironsworn family** (§5.6), or the
   three-call recipe with a hand-applied cap? Recommendation: the tool.
2. **Offer the meter, track and session tools only to adventures that use
   them** (§4.7), or to every story? Recommendation: only those that use them.
3. **Should the engine count the Reckoning's 1s** (an option on
   `end_session`), or the GM? Recommendation: the GM for now; it is a handful
   of dice once a night.
4. **Built-in packs in the library: read-only, or editable copies?**
   Recommendation: read-only in the library, editable once imported.
5. **Publishing.** Shipping Blood & Bone in the app puts the AI edition's
   text in this public repository. Confirm that is wanted.
6. **The proposals in §5.4 and the renames in §5.7.**

## 8. Verification

What proves it works, end to end:

- **Unit tests** (seeded `Math.random`, as the suite does): meters clamp,
  cap, floor, `onlyUp`, threshold reports and once-per-scene/session keys;
  tracks' tick arithmetic for every rank and `progress_roll` outcomes;
  tally challenges score and close after the last round; `end_session`
  resets what it should.
- **Budget tests:** the core note ≤ 3,000 tokens, each reference note
  ≤ 2,500, the filled sheet ≤ 1,000, measured with the app's estimator; note
  titles unique across both packs.
- **Shipping tests:** both packs appear in a fresh notes library; importing
  them into a draft dedupes; *The Hollow Hour* starts and its story passes
  `ensureStoryDataArrays()`.
- **Builds:** the suite, `tsc`, and the standalone export
  (`node scripts/build-standalone.mjs`), since the packs must be in the
  static export.
- **Engine review:** every slice that touches `app/misc/` gets the
  `engine-review` agent.
- **What a cloud session cannot do,** added to `pending_tests.md` when built:
  play *The Hollow Hour* on a real model through session zero, one feeding,
  one Rule of 3 fight and one dawn, and check that Stress, the tally and the
  Reckoning land in the meters as the rules say (decision 76).
