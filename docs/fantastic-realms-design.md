# Fantastic Realms — design

**Status:** approved ("Build it", decision 219), revised after Codex's review
([`research/codex-fantastic-realms-review-2026-10-25.md`](research/codex-fantastic-realms-review-2026-10-25.md)),
for the author's go. Not approved for building yet. Decisions 201–218
(`docs/decisions.md`). The implementation plan (files, signatures and slice
order) is a second document, written after this one is approved
(`workflow.md` Phase 3).

## 1. What it is

Fantastic Realms is the second built-in system, after Blood & Bone. It is a
light fantasy game in which **words are power**. A hero is a one-line concept
and a handful of **feats**: words or short phrases such as *Brave*, *Quick*,
*Sword*, *Armor*, *Mind Control*, *"I hate goblins!"*, *Quick Shot*. Every
feat that fits what the hero is doing adds a die.

It is inspired by EZD6, Stonetop, Tiny RPG, Mythic Bastion Land and Legends
of the Mist, and its description says so (decision 215). It copies no text,
tables or names from any of them (decision 3).

Like Blood & Bone, it ships as built-in packs and a starter listed on the
Library home. Unlike Blood & Bone, it needs its own coded roll and a few
generalisations of the system hooks (§5).

**Words used below.** A die that equals or beats the DC is a **success**. The
number of successes gives the **result**: miss, weak hit, hit, strong hit.
"Hit" on its own always means the result, never a die.

## 2. The rules

### 2.1 The roll

- **The pool** is the base die, plus one d6 for every feat that applies.
  - The player names the feats they lean on, and the GM accepts or refuses
    each.
  - A knight fighting with *Quick*, *Sword* and *Armor* rolls 1 + 3 = **4d6**.
  - Each feat counts once per roll.
- **The DC** is set by the GM from the situation, 1 to 6:

  | DC | Means |
  |---|---|
  | 1 | Easy. No roll; it happens, as a hit. |
  | 2 | Average: it can go wrong. |
  | 3 | Hard. |
  | 4 | Very hard. |
  | 5 | Heroic. |
  | 6 | Almost impossible. |

- **Successes.** Each die that **equals or beats** the DC is a success
  (decision 202).
- **Results:**

  | Successes | Result |
  |---|---|
  | 0 | **Miss**: it fails, and it costs (§2.3). |
  | 1 | **Weak hit**: it works, with a cost or only partly. |
  | 2 | **Hit**: it works. |
  | 3 | **Strong hit**: it works well, with something extra. |
  | 4+ | **Strong, one magnitude greater per success beyond 3**: four is strong +1, five is strong +2. |

  "A magnitude" is the GM's to narrate: more damage (§2.6), more foes
  affected, further, faster, a lasting edge.

**The curve** (at least one success / at least three):

| Pool | DC 2 | DC 3 | DC 4 | DC 6 |
|---|---|---|---|---|
| 2d6 | 97% / – | 89% / – | 75% / – | 31% / – |
| 4d6 | 99.9% / 87% | 99% / 59% | 94% / 31% | 52% / 2% |

### 2.2 Burning a feat

Burning is a grand display of one feat (decision 204):

- **What it gives.** The burned feat counts as **one sure success**, and
  **its die is still rolled**, so it can add a second.
- **What it costs.** The feat then adds nothing to any roll until the next
  rest.
- **Who can burn.** Only a feat that applies to the roll and is not already
  burned. A pool of the base die alone has nothing to burn.
- **How often.** One burn per roll.
- **When it counts.** The burn is recorded only when the roll completes. A
  roll that is cancelled, or refused by the engine, burns nothing.

### 2.3 Harm to heroes: hearts

Decisions 203, 206 and 216:

- A hero has **3 hearts** at the start.
- **A miss costs 1 heart** by default, or 2 when the foe or danger has a harm
  word that applies (*Deadly*, *Fire-Breath*). Harm words do not stack: a miss
  never costs more than 2.
- **A weak hit costs 1 heart** only when the GM picks harm as its cost.
  Otherwise its cost is something else: a position lost, gear damaged, a foe
  unhurt, time spent.
- **At 0 hearts the hero is down.** They are out of the scene, and the GM
  picks a cost: captured, scarred (written on the sheet), a feat lost, gear
  gone.
- **Death** comes only when the realm's tone and the stated stakes say so,
  and the GM says so before the roll.
- **A rest heals every heart.**

### 2.4 Who rolls, and how foes are written

**Only players roll** (decision 205). Every other character, from a goblin to
a dragon, is a stat line:

| Part | What it holds |
|---|---|
| **DC** | The number a hero rolls against to act on it. **Its permanent words are already counted in it** (an *Armored* knight is printed at DC 4, not DC 3 + 1). |
| **Words** | Two to four: *Fast*, *Armored*, *Pack*, *Fire-Breath*. They tell the GM what it does, which costs a miss carries, and its initiative edge. |
| **Hearts** | 1 for a mook, 3 for a champion, 5 or more for a legend. |
| **XP** | What beating it gives (§2.7). |

**Situational modifiers.** The GM may move the DC by 1 for the moment: a
foe that is cornered, blinded or on high ground. The final DC stays within
2–6.

### 2.5 Rests

There is one kind of rest, and **the realm sets its condition**:

| Realm | Rest |
|---|---|
| A bright heroic realm | A few hours. |
| A folk frontier | A night by a fire with a full meal. |
| A grim realm | Weeks, somewhere safe. |

**A rest covers every hero who takes part**, which by default is everyone
present. For each of them it:
- heals every heart;
- un-burns every feat.

The realm the story is in is recorded (§5.2). `take_rest` returns that realm's
condition as a reminder; whether the fiction allows the rest is the GM's
call.

### 2.6 Fights

**Initiative** is rolled once, when a fight starts (decisions 201, 212):
- each hero rolls 1d6 + 1 per feat that helps them get the edge;
- each foe's number is its DC + 1 per edge word (*Fast*, *Ambusher*), with no
  roll.

**The order** runs highest first. Ties go to the heroes.

**A foe's turn** (decision 217). Foes never roll, so a foe acting means:
1. The GM narrates its threat: a charge, a spell, an ambush, aimed at one or
   more heroes.
2. Each targeted hero who has not yet acted rolls to answer it, against the
   foe's DC, with the feats that help.
3. The result decides the harm:
   - a **miss** takes the harm (§2.3);
   - a **weak hit** takes it partly, or pays another cost;
   - a **hit** or better avoids it;
   - a **strong hit** can also turn it.

Heroes who beat a foe's number act before its threat lands.

**Damage to foes** (decision 216):

| Result | Hearts lost |
|---|---|
| Weak hit | 1, and the hero pays a cost |
| Hit | 1 |
| Strong hit | 2 |
| Each magnitude | +1 |
| DC 1 (no roll) | Counts as a hit: 1 |

**After the first round** play goes back to the usual turn-taking, with the
spotlight moving. Engine combat (`start_combat`) stays off, as in Blood &
Bone.

**A worked example.**
- Bryn (*Brave*, *Quick*, *Sword*, *Armor*, 3 hearts) meets a goblin
  champion: DC 3, *Fast*, *Pack*, *Cruel*, 3 hearts, 600 XP.
- **Initiative.**
  - Bryn rolls 1d6 + 1 for *Quick* and gets 4.
  - The goblin's number is DC 3 + 1 (*Fast*) = 4.
  - The tie goes to Bryn, so Bryn acts first.
- **Bryn attacks** with *Quick*, *Sword* and *Brave* (4d6 at DC 3) and burns
  *Sword*.
  - The dice show 5, 2, 3, 1. The burned *Sword* adds one sure success.
  - That is 2 + 1 = **3 successes, a strong hit**: the goblin loses 2 hearts.
- **The goblin's threat:** it snaps at Bryn's leg. Bryn answers with *Armor*
  (2d6 at DC 3).
  - The dice show 1, 2: **a miss**. Bryn loses 1 heart (*Cruel* is not a harm
    word).
- **Bryn attacks again**, now without *Sword*, which stays burned until a
  rest. *Quick* and *Brave* make 3d6.
  - The dice show 6, 2, 4: **2 successes, a hit**. The goblin loses its last
    heart.
- **The reward:** 600 XP to each hero present.

### 2.7 Experience and levels

**Earning XP** (decisions 208, 213, 218):

| Source | XP |
|---|---|
| A foe beaten | DC × 50 for a mook, × 200 for a champion, × 1,000 for a legend, written on each foe. |
| A treasure gathered | Roughly its worth in gold, written on it. |
| A quest finished | 500 to 2,000. |

- **Every hero present gets the full amount**, with no splitting (decision
  218).
- **Each award names its source.** An award is refused if that hero already
  had the same source, so a foe or a treasure is never counted twice.

**Levelling** (decisions 208, 209, 214):
- Going from level N to N + 1 costs **(N + 1) × 1,000 XP**, and the counter
  resets. Level 2 costs 2,000 XP, then level 3 costs 3,000 more. Several levels
  at once are counted in order.
- **Every level gives a new feat**, earned in play: the GM offers it from what
  happened ("Dragon-Scarred", "Friend of the Deep King"). The player may also
  sharpen the wording of an existing feat, but the new feat is still gained.
- **Every third level** (3, 6, 9…) also gives **+1 maximum heart**, and that
  heart is gained at once.

### 2.8 Starting heroes

A hero starts with (decision 207):
- **a one-line concept**;
- **four feats**: at least one about who they are and one about something
  they carry, and phrases are allowed;
- **3 hearts**;
- **level 1** and **0 XP**.

**Full step-by-step setup** asks, per player:

| Step | Asks for |
|---|---|
| `concept` | The one-line concept. |
| `feats` | The four feats, with suggestions drawn from the concept and the realm. |
| `realm_tie` | Why the hero is in the starting realm. |

Then come the shared `name_look`, `history` and `drives`. The `history` hint
is reworded for this system (§5.3), because the shared hint asks about a
supernatural transformation.

**Every hero is set up in the engine** the moment their feats are known:
- in full setup;
- in quick setup;
- for a pre-made hero;
- for a player who joins later.

The core note tells the GM to do this, as Blood & Bone's core does with its
meters (§5.2).

## 3. The world: the realms

The world pack is **a crossroads of realms with different rules** (decision
211), written as original material:
- **The Crossroads.** One overview note: what the realms are, how travel
  between them works, and each realm's rest rule in one line.
- **Three realms**, each in its own note: its look, its tone, its rest
  condition, a handful of people, places and troubles, and its foes as stat
  lines (§2.4).
  - a bright heroic realm;
  - a folk frontier;
  - a grim realm.
- **Tables** as `table` notes: names, foes, treasure (with XP), and "what's
  on the road". They follow Blood & Bone's table conventions: the die in each
  heading, and `checkTableShape` passing.

The realm names and contents are written in the content slices and reviewed
then.

## 4. The starter

One starter (decision 210), opening on an **arrival**, never mid-crisis
(decisions 197–198):
- the heroes come into one realm (the folk frontier is the natural first) for
  a reason the setup gives them;
- the authored opening is played after setup and the briefing;
- the trouble comes later in the first session.

It carries:
- a secret Campaign Plan outline;
- a "Running it" note with the realm's rest rule;
- a few pre-made heroes as presets;
- its realm's foes and treasure.

## 5. The engine

### 5.1 Which system a story runs, and its tools

**Today.**
- `resolveSystem` picks the first built-in system that owns any note the story
  holds.
- Every system story is offered Blood & Bone's four tools (`SYSTEM_TOOL_NAMES`).
- `systemState.usesSystemTools` can force them on or off.

**The change:**
- **The system is recorded.** `systemState.systemId` is set when a story first
  resolves to a system: started from a starter, or holding a system's core
  note. From then on it wins over note matching, so importing another
  system's notes, or deleting some, never switches the system mid-campaign.
  - An old save has no `systemId`; it gets one derived once, by today's rule.
  - A story holding two systems' core notes keeps the recorded one. Without a
    record, the first system in `BUILTIN_SYSTEMS` order wins, which is
    Blood & Bone.
- **A system declares its tools.** `BuiltinSystem` gains `tools: string[]`:
  - Blood & Bone lists its four, unchanged;
  - Fantastic Realms lists its own (§5.2).
  - The GM is offered exactly the resolved system's list.
- **The overrides keep working:**
  - tools *off* gives none;
  - tools *on* with no system (the Designer's legacy switch) keeps Blood &
    Bone's four, so nothing that works today changes.
- **The cache rule holds.** The list depends only on `systemState.systemId`
  and the override, both story-level and read the same every turn.
- **The budget holds.** `tests/toolBudget.test.ts` gets a Fantastic Realms
  case under the 10,000-token budget.

This is the "named coded roll" decision 183 named as the next hook.

### 5.2 The Fantastic Realms tools and state

**State.** It lives in `systemState`, is optional and backward-compatible
(absent on old saves, filled on first use), and travels with the story blob,
so save, load, sync and Undo carry it unchanged.

| Part | Holds | Shown to |
|---|---|---|
| **Heroes** | For each hero (keyed by the same owner names the meters use): a list of feats, each with a stable id, its wording and a burned flag; and the reward sources already credited. | The GM's live block every turn ("Bryn: Brave, Quick, Sword (burned), Armor"), and the player's panel. |
| **Realm** | The realm the story is in. | `take_rest`. |

**Meters** (`manage_meter`, the "Fantastic Realms hero" set):

| Meter | Range | Notes |
|---|---|---|
| Hearts | 0–max | Max starts at 3. |
| Level | 1–20 | |
| XP | 0 to the next level's cost | |

The meters show on the existing Meters panel. `award_xp` is the only writer of
XP and Level, and it raises Hearts' `max` and `cap` together through a new
`raiseMeterMax` in `metersAndTracks.ts`. Blood & Bone's meters are untouched.

**`manage_feats({ hero, action: add | rename | remove, feat, new_wording? })`**
- Sets up and edits a hero's feats.
- A rename keeps the feat's id, so a burned feat stays burned when it is
  sharpened.
- Feat wording is matched loosely (case and punctuation), so *Sword* and
  *sword* are one feat.

**`feat_roll({ hero, feats, dc, burn?, reason })`**
- **Validates.** Every feat must be one of that hero's feats, unburned, and
  named once. `burn` must be one of `feats`. DC must be 2–6.
- **Rolls.** It takes the same dice paths as `action_roll`: the physical toss,
  manual dice with validated faces, AI dice.
- **Reports** each die, the successes, and the result with its magnitude.
- **Records the burn** only on a completed roll.
- **A refusal is an engine error, not a miss.**

**`initiative_roll({ heroes: [{ hero, edge_feats }] })`** rolls each hero's
1d6 + edges at once and reports the numbers. Foes' numbers are the GM's to
state (DC + edge words).

**`award_xp({ heroes?, amount, source })`**
- Credits every hero listed, or every hero by default, in full.
- Refuses a source a hero already had.
- Carries over each level cost.
- Reports, for example: "Bryn: level 3 reached. Offer a new feat. +1 maximum
  heart."

**`take_rest({ heroes?, realm? })`**
- Heals and un-burns every hero listed, or all.
- Updates the recorded realm when one is given.
- Returns that realm's rest condition.

**The outcome judge.** The Observer's outcome check reads typed verdicts
(`extractOutcomeVerdicts`). Its filters and labels (`observer.ts` around lines
1397 and 1576) list `action_roll` by name. `feat_roll` is added in each place
together:
- a typed tier: miss, weak, hit or strong, with its magnitude;
- a label;
- an engine refusal kept out, as `action_roll`'s are.

### 5.3 The hooks generalised

**Loading missing notes.** `addMissingBuiltinNotes` hard-codes Blood & Bone's
core id and Europe by Night's setting. `BuiltinSystem` gains:
- **`coreNoteId`**: a story holding it is kept up to date.
- **`defaultSetting`**: what an unset `systemState.setting` means, and the
  scope of its cross-setting notes.

Blood & Bone keeps exactly today's behaviour:
- `builtin:blood-and-bone:core`;
- Europe by Night and `cross-europe`;
- deleted notes never re-added;
- held notes never touched.

**Setup steps.** Shared creation steps can take a per-system hint:
`BuiltinSystem.stepHints`, e.g. `history` for Fantastic Realms. Blood & Bone
keeps today's text.

**Reused as they are:**
- the packs and the starter;
- `creationNoteId` and `creationSteps`;
- the sheet template (concept, feats, hearts, level, XP, gear);
- the Library listing.

**Every new tool** lives in the usual six places (schema, whitelist,
executor, Google list, label, Observer). `tests/gmTools.sixPlaces.test.ts`
holds them, and the engine slice gets the `engine-review` agent.

## 6. What the GM is told

A pinned core note of at most about 3,000 tokens holds:
- successes and results;
- the DC table;
- burning;
- hearts, harm and down;
- how foes are written;
- rests;
- fights, including a foe's turn and damage;
- XP and levels;
- the setup line: "set up every hero with `manage_meter create_set` and
  `manage_feats add`";
- how to read a feat generously but honestly.

The realms, foes, tables and creation rules are read on demand. The creation
note is carried in session zero.

## 7. Slices (for the implementation plan)

1. **The engine:**
   - the recorded system and declared tools;
   - the generalised note loading and step hints;
   - `manage_feats`, `feat_roll`, `initiative_roll`, `award_xp`, `take_rest`;
   - `raiseMeterMax` and the hero state;
   - the outcome-judge typing;
   - tests, including Blood & Bone unchanged and an old save resolving as
     before.
2. **The rules pack:** the core, creation, foes and XP guidance, the sheet
   template and the creation steps; the token budgets tested.
3. **The world pack:** the Crossroads and the three realms, with foes and
   treasure tables.
4. **The starter:**
   - the arrival opening;
   - the plan outline;
   - the "Running it" note;
   - the presets;
   - the Library listing;
   - a browser check and an APK.

Slices 2–4 are prose the author reads in the PR.

## 8. Credit and copying

The mechanics are the author's own combination of ideas, and game mechanics
are not covered by copyright; no text is copied. Fantastic Realms is not built
on an SRD, so it owes no credit line. As a courtesy, the description says
"Inspired by EZD6, Stonetop, Tiny RPG, Mythic Bastion Land and Legends of the
Mist" (decision 215).

## 9. Settled in review

**First pass** (decisions 212–215):
- foe initiative;
- the XP scale;
- +1 maximum heart every third level;
- the "inspired by" line.

**After Codex's review** (decisions 216–218):
- damage by result;
- a foe's turn as a threat the heroes answer;
- XP to every hero in full.

**Codex's other findings, fixed in this text:**

| Finding | Fixed in |
|---|---|
| The recorded system | §5.1 |
| The meter bounds | §5.2 |
| The outcome-judge plumbing | §5.2 |
| The hard-coded note loader | §5.3 |
| Feat identity and visible burns | §5.2 |
| The roll lifecycle and manual dice | §5.2 |
| Per-hero setup | §2.8 |
| The `history` hint | §5.3 |
| DCs counting words twice | §2.4 |
| Duplicate rewards and rest targets | §2.5, §2.7 |
| Sharpening versus a new feat | §2.7 |
| "Hit" meaning two things | Words used, §1 |
| A worked example | §2.6 |

Nothing is open. The next step is the author's go, then the implementation
plan.
