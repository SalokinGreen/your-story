# Default RPG systems — design

**Status:** approved, 2026-10-22 (decision 88); **built** in three PRs
(A the engine, B the screens and library, C the content), 2026-10-22 — the
plan's "Decisions made during implementation" records where the build
differs. Decisions 62–89 in [`decisions.md`](decisions.md); the author's open
questions are answered in §7. The implementation plan is
[`default-systems-implementation-plan.md`](default-systems-implementation-plan.md). The source text for Blood &
Bone's AI edition is [`blood-and-bone/rulebook.md`](blood-and-bone/rulebook.md)
(decision 89).

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
| **Character sheet** | a sheet template the pack carries, set as the adventure's `characterSheetTemplate`; filled into a `character_sheet` note | in full, every round | ≤ 1,000 tokens filled in |
| **Meter and track sets** | engine data (§4.2), defined by the pack and carried by the adventure | a compact section of the state block | one line each |
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

What exists today (checked in the code, 2026-10-22): library notes are
independent IndexedDB rows (`YourStoryNotesLibraryDB`,
`localNotesLibraryManager.ts`) with random ids and no notion of a pack, an
origin or a version; folders are a localStorage list shared by notes,
adventures, stories and tables (`localFolderManager.ts`). Adventures are
IndexedDB rows too (`localAdventureManager.ts`), and they sync: a row with a
per-device id is pushed from every device that has it (`syncManager.ts`
`mergeItems`). Nothing seeds content on first run; the nearest pattern is the
idempotent `migrateTablesLibraryToNotes` that runs on every library load.
`sample_adventures.ts` and `starter_stories.ts` are dead code with empty
lore and legacy stat arrays, and one of them carries sexual content under
`nsfw: false`; they are not a model to revive.

So:

- **In the repository, as source.** Each system lives in
  `app/misc/systems/<system-id>/`: its notes, tables, sheet template, meter
  and track sets, and its starter adventure, as TypeScript modules, listed
  in a registry `app/misc/systems/index.ts`. Being source means it is in the
  static export the native apps package, with no fetch at runtime, and the
  suite can test it. The repo is public, so this publishes the AI edition's
  text, which the author wants (decision 82).
- **Built-ins are never written to the device** (decision 81). The library
  merges the
  registry's packs and starters into what it shows, marked *Built-in*: the
  notes library tab (`NotesLibraryTab.tsx`), the picker
  (`LibraryPickerModal.tsx`) and the adventure list (`library/page.tsx`,
  `AdventuresLibraryTab.tsx`). Kept out of IndexedDB, they cannot be edited
  in place, cannot sync as one duplicate per device, and are always the
  version the app shipped with. Each built-in note has a stable id
  (`builtin:blood-and-bone:core`) so an import can be traced and deduped.
- **Two packs** (decisions 63, 75): *Blood & Bone — Rules* and *Blood &
  Bone — Europe by Night*, each shown as a built-in folder. Importing copies
  the notes into the adventure or story: the Designer through
  `importFromLibrary` (`useDesignerSession.ts`), the in-story lore editor
  through its picker (`LoreEditor.tsx`). Importing the rules pack into a
  Designer draft also sets the adventure's sheet template and meter and
  track sets, when the draft has none, and tells the Designer so through
  `summarizeDraft()`.
- **A starter adventure:** *The Hollow Hour*, built on both packs, in the
  adventure list. *Play* starts it through the existing
  `startAdventureLocally`; *Open in Designer* makes an ordinary local copy
  first, since a built-in cannot be edited.
- **Updates.** A newer app ships newer built-ins. Notes already imported
  into an adventure or a story are copies and never change underneath the
  author or the player.
- **The Designer** learns that built-in packs exist and what each contains,
  so it can offer one when an author's adventure needs rules.

Two existing import paths behave differently, and the implementation plan
must pick one rule for both: the Designer dedupes on `libraryNoteId` *or* a
case-insensitive title match and then overwrites the existing note
(`useDesignerSession.ts` `importFromLibrary`, whose docstring claims
`libraryNoteId` only), while the lore editor appends with no dedupe at all.

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
| `owner` | a character's name, or `world` | "Mira"; `world` for Heat |
| `min`, `max` | the full range | 0, 6 |
| `cap` | the current ceiling, ≤ `max` | 6, then 5 at Beast 6, 4 at Beast 9 |
| `floor` | the current floor, ≥ `min` | 0, then 1 at Beast 9 |
| `value` | | 2 at creation |
| `thresholds` | labels at values, reported when crossed | Exposure 3 "Attention", 4 "Pressure"… |
| `resets` | optional: back to a value at each scene or session | none in Blood & Bone yet (§5.5); for a system with per-scene pools |
| `onlyUp` | optional: the value may never fall | Beast |

One tool, **`manage_meter`**, with actions `create`, `create_set` (below),
`adjust` (by an amount), `set`, `set_cap`, `set_floor` and `remove`. The
engine:

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

**Owners are names.** `StoryData` has no list of characters: a character is
a `character_sheet` note (one per player in a party, titled
"Character: *name*"), plus `player_name` when solo and the couch roster
(`multiplayer.couchPlayers`) in multiplayer, and every tool that targets a
player does it by name (`ask_for_roll`'s `player_name`, `ask_question`'s
`target_player_name`). Meters and tracks follow suit: the owner is the
character's name, matched case-insensitively, or `world`.

**Sets, so the GM never types a range.** A pack defines named sets ("Blood &
Bone character": Stress 0–6 starting at 2, Beast 0–10 only rising, Exposure
0–6 with its thresholds, XP; "Witch": the Ledger; "Wendigo": the Slipping
Mask). The adventure carries them, and `manage_meter`'s `create_set` action
makes a whole set for one owner in one call. A meter the GM creates by hand
remains possible for anything a set doesn't cover.

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

Today the active challenge is invisible: no screen shows it, and the GM sees
its count only by calling `get_game_state` or in the result of the last
check. A three-turn fight needs the tally in front of both, so the active
challenge joins the GM's state block and the player's view (§4.6). There are
also two `start_challenge` implementations and two schemas (`gmExecutor.ts`
and `toolExecutor.ts`; `gmTools.ts` and `toolSchemas.ts`). The GM
executor's path wins today, and the implementation plan removes the other
before extending it.

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

**What "a scene" is.** The once-a-scene keys count scenes with
`agmtState.sceneCount`, which only `increment_scene` advances. They do not
use `computeSceneKey` (the key behind the tier-3 cap), which buckets every
20 story parts and has nothing to do with the GM's scenes. So "once a scene"
is only as good as the GM's habit of calling `increment_scene`; Blood &
Bone's core tells it to call it at every scene change, and playtests watch
for it (§6).

The Reckoning itself stays a GM procedure with existing tools:
`formula_roll(["4d6"])` for Stress 4 reports every die, the GM counts the 1s,
and `manage_meter` raises Beast by that many (decision 80).

### 4.6 What the GM and the player see

- **The GM:** a compact *Meters & tracks* section in the pinned state block,
  one line each ("Mira — Stress 3/6 (cap 6) · Beast 1/10 · Exposure 2/6
  (Rumour)"; "Vow: Find who is taking the bodies — dangerous, 3 boxes"). It
  costs a few tokens per line, which is far cheaper than the prose it
  replaces.
- **The player:** the same numbers as bars and boxes, with the active
  challenge's tally, in a panel beside the pinned character sheet on the
  Lore page (`app/story/lore.tsx`, which already pins `character_sheet`
  notes). There is no player-facing display of engine state today, not even
  for timers; the only one is the debug `ContextViewer.tsx`.
- **Online guests:** they receive the whole `StoryData` already
  (`multiplayer/session.ts` `state_snapshot`), meters included. Local save,
  sync and story export also write the whole `StoryData`, so new optional
  fields ride along with no field list to update.

### 4.7 Cost

Every request carries every tool schema, about 15,800 tokens today. The new
tools and a wider `start_challenge` would add roughly 1,500–2,000 tokens to
every request of every adventure, Blood & Bone or not. So `manage_meter`,
`manage_track`, `end_session` and `action_roll` are offered only to stories
whose adventure declares it uses them, which a pack sets when imported and
the Designer can set by hand (decision 79). The wider `start_challenge` is
offered as today.

### 4.8 Where it lives in the code

The implementation plan turns this into signatures and slices; these are the
files it touches, found by tracing `manage_timer` and the challenge tools
through every place a GM tool is wired.

| what | where |
|---|---|
| Shapes: `Meter`, `ProgressTrack`, the sets, `sessionCount`, the dedup keys, and the challenge's `mode`, `rounds` and `tally` | `app/misc/structs.ts` (new optional fields on `StoryData`; `SceneChallenge`); no backfill needed in `storyDataDefaults.ts`, which fills only required arrays |
| The arithmetic: clamps, caps, dedup, ticks by rank, `progress_roll` | a new pure module, `app/misc/metersAndTracks.ts`, so it is testable without the executor |
| Schemas for `manage_meter`, `manage_track`, `end_session`, `action_roll`; the wider `start_challenge` and `record_challenge_result` | `app/misc/gmTools.ts` (`GM_TOOL_SCHEMAS`, `GM_TOOL_NAMES`, `GM_TOOL_MAP`) |
| Offering them, conditionally (§4.7) | `app/misc/ai_staged.ts`, the `legacyToolNames` whitelist in `buildGMStagePrompt` |
| Executing them | `app/misc/gmExecutor.ts` (the tool switch); the duplicate challenge path in `toolExecutor.ts` removed |
| The GM's view: the *Meters & tracks* section and the active challenge | `app/misc/ai_staged.ts`, beside `formatTimersState` |
| The lists a new tool must join | `gmToolLabels.ts`; `GOOGLE_ESSENTIAL_TOOLS` in `providerCall.ts`; `STATE_CHANGE_TOOLS` in `toolExecutor.ts`; `DICE_TOOLS` in `generation.ts` (a progress roll's miss is a valid outcome, not a tool error); the Observer's `OUTCOME_CHECK_TOOL_NAMES` for tally outcomes |
| Surviving compaction | `storyCompaction.ts` `buildCondensedStorySeed`, which resets transient state (it resets `activeChallenge` and `timers`); meters and tracks must be kept |
| The adventure carrying sets, the sheet template and the pack it came from | `designer_executor.ts` (`AdventureDraft`, `draftToAdventure`, `adventureToDraft`) and `localStoryManager.ts` `startAdventureLocally` |
| The player's panel | a new `app/story/MetersPanel.tsx`, shown from `app/story/lore.tsx` |
| Built-ins | `app/misc/systems/`; the library merges in `NotesLibraryTab.tsx`, `LibraryPickerModal.tsx`, `library/page.tsx`, `AdventuresLibraryTab.tsx`; import in `useDesignerSession.ts` and `LoreEditor.tsx` |

Every slice that touches `app/misc/` gets a test baseline first and the
`engine-review` agent after (`CLAUDE.md`).

## 5. Blood & Bone: the AI edition

### 5.1 What it is

The book stays the author's: a 58,000-token rulebook (measured, cl100k) for
people at a table, kept in the repository as the source text
(`docs/blood-and-bone/rulebook.md`, decision 89). The AI edition is the same game repackaged for the GM:
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

### 5.4 Rules for the gaps

Decision 73 had the session propose a rule for each gap the book leaves;
the author accepted every one (decisions 83–86), with the Predator's line in
item 3 settled by decision 85.

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
   step faster" becomes +2 per foodless dawn. The Predator's "resets the
   Mask fully" becomes: killing living prey resets the Mask, and the next
   dawn does not advance it (decision 85).
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
| **Action roll** | `action_roll` with the stat's value and the adds (decision 78); the engine caps adds at +2 and the score at 10 and reports the outcome and any match (§5.6) |
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

### 5.6 The action roll is a tool

With the tools that exist today, an action roll costs three calls across two
rounds (the roll, then one comparison per challenge die), and the score's
cap at 10 can't be written: `calculate` has no functions, and `min(score,
10)` silently returns a wrong number (§6.17). So the engine gets an
**`action_roll`** tool for the Ironsworn family (decision 78): the stat's
value and the adds in; the engine caps the adds at +2 and the score at 10,
rolls one d6 and two d10s, compares, and returns strong hit, weak hit or
miss, the dice, and whether the two d10s matched. One call instead of three,
and the same comparison `progress_roll` does.

It honours the player's dice mode like `formula_roll` does: when the player
rolls physical or manual dice, their faces feed the same comparison. Like
`progress_roll`, it judges the roll, a deliberate exception to "tools never
judge" for the same reason (§4.3): with the adds and score capped by rule,
there is no difficulty for anyone to choose.

A missed roll then takes about four of the GM's ten rounds (the roll, the
miss table, its d6, the meter change), and Rule of 3 at one roll per turn
stays well inside that.

### 5.7 Names that collide

The GM opens notes by exact title, and several names in the book mean two
things. The note split (§5.2) keeps note titles unique, but the names still
appear inside notes, where the GM has to tell them apart. The AI edition
renames one side of each pair (decision 87):

| name | means | and also | renamed |
|---|---|---|---|
| The Reckoning | the end-of-session roll | a Rite (calling debts due) | the Rite becomes *The Calling Due* |
| The Vigil | the hunters' network | a Rite (sitting with the dead) | the Rite becomes *The Wake* |
| The Hollow | the Wendigo's Beast track | a Haven | the Haven becomes *The Forgotten Room* |
| The Turning | turning others (Ch. 2) | the Werewolf's Beast track | the track becomes *The Wild* |

### 5.8 The sentences to rewrite (decision 69)

These passages in the author's draft were near-verbatim from the Ironsworn
rulebook (checked against a 2019 copy; Starforged's prose was not checked).
They are named by place here, not quoted, so the repository does not carry
them. The replacements keep every rule, and they are already applied in the
repository copy, `docs/blood-and-bone/rulebook.md` (decision 89), along with
the three outcome lines under *Resolving the Outcome*, rewritten the same
way.

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

The credits carry Tomkin Press's "This work is based on Ironsworn…" line in
its CC BY 4.0 form (the licence of the Ironsworn SRD, where the engine's
basics and move names come from), add "not an official Ironsworn product",
and replace "all text… original", which was not true of these passages
before the rewrite, with what the game takes from Ironsworn and what is its
own.

### 5.9 The character sheet

A sheet template the rules pack carries and sets as the adventure's
`characterSheetTemplate`, which is what the live character-creation form
fills (`create-character/form.tsx`). The nine shipped
`CHARACTER_SHEET_PRESET_TEMPLATES` reach no live screen (their only reader,
`CharacterSheetTemplateEditor.tsx`, is imported nowhere), so a preset alone
would never be seen. Built from Appendix B: name, Kind, Archetype, Path,
the five stats, the Kind's Stress triggers, Recover move and Weakness, Connections with ranks, Burdens, assets
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
creates each character's meter sets and Vow tracks with `create_set` and
`manage_track`. In a party, that is one sheet and one set per player, as the
existing Players & Preferences note already asks. *The Hollow Hour* is a
starter adventure on top of that: its premise, its three NPCs (Runa Sandhu, Callum
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
- **Tool rounds.** A missed roll uses about four of the GM's ten rounds
  (§5.6). Watch for turns that hit the cap.
- **Scene changes.** "Once a scene" depends on the GM calling
  `increment_scene` (§4.5). If it rarely does, triggers cap far too low.
- **Gemini.** The stale Google tool filter (§6.14) leaves out the timer and
  challenge tools today and would leave out the new ones; Blood & Bone does
  not work on Google models until §6.14 is fixed.
- **The director.** Its pressure moves come with a rolled complication seed;
  Blood & Bone has its own complication oracle and miss tables. Two sources
  of complications may pile up.
- **The Observer's oracle check** flags turns that use none of
  `fate_question`, `roll_table` or `roll_portent`. Blood & Bone's tables are
  rolled with `formula_roll`, so expect advisory flags; they don't block.
- **Secrets.** Hidden notes reach the narrator (§6.16). *The Hollow Hour*
  keeps the truth about Runa (an abandoned fledgling, not a monster) as a
  secret the players should uncover; until §6.16 is fixed, the narrator can
  see it once the GM reads it.

## 7. Answered questions

The author answered the design's open questions on 2026-10-22:

1. **An `action_roll` tool:** yes (decision 78, §5.6).
2. **The meter, track, session and action-roll tools:** offered only to
   adventures that use them (decision 79, §4.7).
3. **The Reckoning's 1s:** the GM counts them, for now (decision 80, §4.5).
4. **Built-ins:** kept in memory and merged into the library, never written
   to the device (decision 81, §3.3).
5. **Publishing:** yes, the AI edition goes in the public repository
   (decision 82), and the rulebook with it as the source (decision 89).
6. **The proposals in §5.4 and the renames in §5.7:** all accepted
   (decisions 83–87).

## 8. Verification

What proves it works, end to end:

- **Unit tests** (seeded `Math.random`, as the suite does): meters clamp,
  cap, floor, `onlyUp`, threshold reports and once-per-scene/session keys;
  tracks' tick arithmetic for every rank and `progress_roll` outcomes;
  `action_roll`'s caps, ties and matches; tally challenges score and close
  after the last round; `end_session` resets what it should.
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
