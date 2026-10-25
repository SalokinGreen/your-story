# Fantastic Realms — design

**Status:** design, for the author's review. Not approved for building yet.
Decisions 201–215 (`docs/decisions.md`). The implementation plan (files,
signatures and slice order) is a second document, written after this one is
approved (`workflow.md` Phase 3).

## 1. What it is

Fantastic Realms is the second built-in system, after Blood & Bone. It is a
light fantasy game in which **words are power**. A hero is a one-line concept
and a handful of **feats**: words or short phrases such as *Brave*, *Quick*,
*Sword*, *Armor*, *Mind Control*, *"I hate goblins!"*, *Quick Shot*. Every
feat that fits what the hero is doing adds a die.

It is inspired by EZD6, Stonetop, Tiny RPG, Mythic Bastion Land and Legends
of the Mist. It copies no text, tables or names from any of them (decision 3).
The rules, the world and the starter are written for this project. Section 8
covers why no credit line is owed.

Like Blood & Bone, it ships as built-in packs and a starter listed on the
Library home, and runs on the engine's system hooks. Unlike Blood & Bone, it
needs its own coded roll. That is the engine change in §5.

## 2. The rules

### 2.1 The roll

- **The pool.** The base die, plus one d6 for every feat that applies.
  - The player says which feats they lean on, and the GM accepts or refuses
    each one.
  - A knight fighting with *Quick*, *Sword* and *Armor* rolls 1 + 3 = **4d6**.
  - The rules count each feat once per roll, however well it fits.
- **The DC.** The GM sets it from the situation, 1 to 6:

  | DC | Means |
  |---|---|
  | 1 | Easy. No roll; it happens. |
  | 2 | Average: it can go wrong. |
  | 3 | Hard. |
  | 4 | Very hard. |
  | 5 | Heroic. |
  | 6 | Almost impossible. |

- **Hits.** Each die that **equals or beats** the DC is a hit (decision 202).
- **Results:**

  | Hits | Result |
  |---|---|
  | 0 | **Miss**: it fails, and the GM makes it cost (§2.3). |
  | 1 | **Weak hit**: it works, with a cost or only partly. |
  | 2 | **Hit**: it works. |
  | 3 | **Strong hit**: it works well, with something extra. |
  | 4+ | Strong, and **one magnitude greater per hit beyond 3**: four hits is strong +1, five is strong +2. |

  "A magnitude" is the GM's to narrate: more damage, more foes affected,
  further, faster, a lasting edge. The result line says the number, so the
  narration can scale with it.

The arithmetic, for a feel of the curve (at least one hit / at least three
hits):

| Pool | DC 2 | DC 3 | DC 4 | DC 6 |
|---|---|---|---|---|
| 2d6 | 97% / – | 89% / – | 75% / – | 31% / – |
| 4d6 | 99.9% / 87% | 99% / 59% | 94% / 31% | 52% / 2% |

Small pools rarely reach a strong hit. A hero leaning on many feats usually
does at an average DC, and almost never against DC 6.

### 2.2 Burning a feat

Burning is a grand display of one feat (decision 204):
- The burned feat counts as **one sure hit**.
- **Its die is still rolled**, so it can add a second hit.
- The feat is then **burned**: it adds nothing to any roll until the next
  rest.
- One burn per roll.
- The engine records the burn and refuses a burned feat until a rest (§5).

### 2.3 Harm: hearts

Decisions 203 and 206 set harm:
- A hero has **3 hearts**.
- **A miss usually costs a heart.** A weak hit can, when the cost the GM
  picks is harm.
- **At 0 hearts the hero is down.** They are out of the scene, and the GM
  picks a cost: captured, scarred (a lasting status the GM writes on the
  sheet), a feat lost, gear gone.
- **Death** comes only when the realm's tone and the stated stakes say so.
  The GM says so before the roll.
- **A rest heals every heart.**

### 2.4 Who rolls

**Only players roll** (decision 205). Every other character, from a goblin to
a dragon, is written as:
- a **DC**;
- a few **words** (*Fast*, *Armored*, *Pack*, *Fire-Breath*);
- **hearts** (how many hits it takes to beat: 1 for a mook, 3 for a champion,
  more for a legend);
- the **XP** it gives (§2.7).

A foe's words set the DC and the cost of a miss. *Armored* raises the DC to
hit it, and *Fire-Breath* makes a miss cost two hearts. The foe never rolls
against the player.

### 2.5 Rests

There is one kind of rest, and **the realm sets its condition**:

| Realm | Rest |
|---|---|
| A bright heroic realm | A few hours. |
| A folk frontier | A night by a fire with a full meal. |
| A grim realm | Weeks, and somewhere safe. |

A rest:
- heals every heart;
- un-burns every feat;
- is the moment the GM offers anything milestone-shaped.

The engine's `take_rest` tool does the bookkeeping and reminds the GM of the
realm's condition (§5). Whether the fiction allows a rest is the GM's call.

### 2.6 Combat and initiative

There are no combat rounds beyond the usual turn-taking. When it matters who
goes first:
- **A hero's initiative** is 1d6, plus 1 for every feat that helps them get
  the edge.
- **A foe's initiative** is its DC, plus 1 for each of its words that gives an
  edge (*Fast*, *Ambusher*). It does not roll, per §2.4.
- **Order:** heroes at or above a foe's number act before it, and the rest
  after.
- **The scene turns to a hero when they choose to act**, as in Blood & Bone.
  Each action is a roll against the foe's DC.
- **Damage:** a hit takes one heart from the foe, and a strong hit takes two
  plus one per magnitude.
- **The foe's actions are the costs of the heroes' misses and weak hits.**

Engine combat (`start_combat`) stays off, as in Blood & Bone. The foe's
initiative number is decision 212.

### 2.7 Experience and levels

**Earning XP** (decision 208). Treasure, enemies and quests each carry an XP
value:
- **Foes:** the XP is written on each foe in the world notes: DC × 50 for a
  mook, × 200 for a champion, × 1,000 for a legend (decision 213).
- **Treasure:** a find's XP is written on it, roughly its worth in gold.
- **Quests:** a finished quest gives 500 to 2,000.

The GM awards XP when a foe is beaten, a treasure is gathered or a quest is
done. At this scale level 2 comes after roughly one adventure; it can be tuned
after playtesting.

**Levelling.** Going from level N to N + 1 costs **(N + 1) × 1,000 XP**, and
the counter resets. So level 2 costs 2,000 XP, then level 3 costs 3,000 more.
- The engine does the arithmetic (`award_xp`, §5) and says when a level is
  reached. Several levels at once are counted in order.
- **A new level gives a new feat** (decision 209). The feat is earned in
  play, and the GM offers it from what happened ("Dragon-Scarred",
  "Friend of the Deep King"). The player may instead sharpen an existing feat
  into a bigger phrase.
- **Every third level** (3, 6, 9…) also gives **+1 maximum heart**
  (decision 214). `award_xp` reports it and raises the Hearts meter's cap.

### 2.8 Starting heroes

A hero starts with (decision 207):
- **a one-line concept**;
- **four feats**: at least one about who they are and one about something
  they carry, and phrases are allowed;
- **3 hearts**;
- **level 1** and **0 XP**.

Full step-by-step setup asks, per player:

| Step | Asks for |
|---|---|
| `concept` | The one-line concept. |
| `feats` | The four feats, with suggestions drawn from the concept and the realm. |
| `realm_tie` | Why the hero is in the starting realm. |

The engine's own steps (`name_look`, `history`, `drives`) follow, as for every
system.

## 3. The world: the realms

The world pack is **a crossroads of realms with different rules** (decision
211), written as original material:
- **The Crossroads.** One overview note: what the realms are, how travel
  between them works, and each realm's rest rule in one line.
- **Three realms**, each in its own note: its look, its tone, its rest
  condition, a handful of people, places and troubles, and its foes with DC,
  words, hearts and XP.
  - a bright heroic realm;
  - a folk frontier;
  - a grim realm.
- **Tables** as `table` notes: names, foes, treasure (with XP), and "what's
  on the road", following Blood & Bone's table conventions (the die in each
  heading, and `checkTableShape` passing).

The realm names and contents are written in the content slices and reviewed
then. This design fixes only the shape.

## 4. The starter

One starter (decision 210), opening on an **arrival**, never mid-crisis
(decisions 197–198):
- the heroes come into one realm (the folk frontier is the natural first) for
  a reason the setup gives them;
- the authored opening is played after setup and the briefing;
- the trouble comes later in the first session.

It carries:
- a Campaign Plan outline (secret, as in Blood & Bone's starters);
- a "Running it" note with the realm's rest rule;
- a few pre-made heroes as presets;
- its realm's foes and treasure with XP.

## 5. The engine

### 5.1 A system declares its tools

Today every system story is offered Blood & Bone's four tools
(`SYSTEM_TOOL_NAMES`: `manage_meter`, `manage_track`, `end_session`,
`action_roll`). The change:
- `BuiltinSystem` gains `tools: string[]`. Blood & Bone lists its four, and
  Fantastic Realms its own.
- `resolveSystem` returns the resolved system's list, and the GM's tool list
  offers exactly that.
- The list is a story-level fact (which system the story's notes belong to),
  read the same on every turn, so the cache rule holds.
- A story with no system offers none, as now.
- A Fantastic Realms story's tool list stays under the 10,000-token budget
  (`tests/toolBudget.test.ts` gets a Fantastic Realms case).

This is the "named coded roll" decision 183 named as the next hook.

### 5.2 The Fantastic Realms tools

**`feat_roll({ hero, feats: string[], dc, burn?, reason })`** rolls the pool
and decides the result. It refuses:
- a DC outside 2–6 (DC 1 is no roll);
- a feat listed twice;
- a burned feat;
- a `burn` that is not one of `feats`.

It reports:
- each die;
- the hits;
- the tier: miss, weak, hit, strong, or strong + N;
- the burn, recorded on the hero.

The dice go through the same physical toss as `formula_roll`. Like
`action_roll`, its result is typed, so the Observer's outcome judge reads its
tier (`extractOutcomeVerdicts`).

The engine cannot see whether a feat fits the action: the player and the GM
decide that. What the engine guarantees is the count, the comparison, the
tier and the burn bookkeeping.

**`initiative_roll({ hero, edge_feats: string[] })`** rolls 1d6 + one per edge
feat and reports the number. *(Or fold it into `feat_roll` as a mode; the
implementation plan picks.)*

**`award_xp({ hero, amount, source })`** adds XP:
- carries over the level cost, (level + 1) × 1,000, as many times as it is
  met;
- updates the hero's Level and XP;
- answers "Level 3 reached: offer a new feat".

**`take_rest()`**:
- heals every hero's hearts to their maximum;
- clears the burned feats;
- returns the realm's rest condition as a reminder;
- does not decide whether the fiction allows the rest.

**`manage_meter`** (existing) keeps the Hearts, XP and Level meters. The
system's meter set is "Fantastic Realms hero": Hearts 0–3, Level from 1, and
XP from 0. On every third level `award_xp` raises the Hearts cap by one
(decision 214).

**State:** burned feats live in `systemState` per hero, beside Blood & Bone's
existing `dedupKeys`. They are not stored in the sheet note, so the GM cannot
forget a burn.

### 5.3 Everything else reuses Blood & Bone's hooks

The system plugs in through the same hooks:
- the packs and the starter;
- `creationNoteId` and `creationSteps`;
- the sheet template (concept, feats, burned, hearts, level, XP, gear);
- `addMissingBuiltinNotes`;
- the Library listing.

Each new tool lives in the usual six places (schema, whitelist, executor,
Google list, label, Observer), and `tests/gmTools.sixPlaces.test.ts` holds
them. The `engine-review` agent reviews the engine slice.

## 6. What the GM is told

A pinned `dm_instructions` core note of at most about 3,000 tokens holds:
- the roll, the DC table and the result tiers;
- burning;
- hearts and "down";
- who rolls;
- rests;
- initiative;
- XP and levels;
- how to read a feat generously but honestly.

The rest is read on demand: the realms, the foes, the tables and the creation
rules (the creation note is carried in session zero, as for Blood & Bone).

## 7. Slices (for the implementation plan)

1. **The engine:**
   - system-declared tools;
   - `feat_roll`, `award_xp`, `take_rest` (and initiative);
   - the meter set, the burned-feat state, outcome-judge typing;
   - tests, including Blood & Bone unchanged.
2. **The rules pack:** the core, creation, foes guidance, XP guidance, the
   sheet template and the creation steps; the token budgets tested.
3. **The world pack:** the Crossroads and the three realms, with their foes
   and treasure tables.
4. **The starter:**
   - the arrival opening;
   - the plan outline;
   - the "Running it" note;
   - the presets;
   - the Library listing;
   - a browser check and an APK.

Slices 2–4 are prose the author reads in the PR.

## 8. Credit and copying

The mechanics here are the author's own combination of ideas (dice pools from
descriptive words, d6 hits against a target, burning a feat). Game mechanics
are not covered by copyright, and no text is copied from the inspirations.
Unlike Blood & Bone, Fantastic Realms is not built on an SRD, so it owes no
credit line. As a courtesy, the system's description says "Inspired by EZD6,
Stonetop, Tiny RPG, Mythic Bastion Land and Legends of the Mist"
(decision 215).

## 9. Settled in review

The four points this design proposed are settled:

| # | Decision |
|---|---|
| 212 | Foe initiative is the foe's DC plus its edge words. |
| 213 | The XP scale stands. |
| 214 | Every third level gives +1 maximum heart. |
| 215 | The description carries the "inspired by" line. |

Nothing is open. The next step is the author's "build it", then the
implementation plan.
