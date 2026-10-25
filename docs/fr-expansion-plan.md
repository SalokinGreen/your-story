# Fantastic Realms, grown — implementation plan

**Status:** plan, for the author's review. Building starts on the author's yes.
The design is [`fr-expansion-design.md`](fr-expansion-design.md) (decisions
243–256, approved 2026-10-25), and its §14 overrides earlier sections. The
base system's plan is [`fantastic-realms-plan.md`](fantastic-realms-plan.md).

Five slices, five PRs, in order: **E1** engine, **E2** rules notes and the
note update, **E3** the original realms grown, **E4** new realms and legends,
**E5** the starter. Every slice runs the suite, `tsc` and the standalone build.
E1 also gets `engine-review`. E2–E5 are prose the author reads in the PR.

## Where the code is today

| Piece | File |
|---|---|
| Hero state shapes | `app/misc/structs.ts`: `HeroFeat`, `FantasticRealmsHero`, `FantasticRealmsState` (in `SystemState.fantasticRealms`) |
| The pure rules | `app/misc/systems/fantastic-realms/engine.ts`: `countSuccesses`, `resultFor`, `foeDamage`, `applyXp`, `normaliseFeat` |
| The executors | `app/misc/gmExecutor.ts`, about lines 6800–7325: `executeManageFeats`, `frResolveFeats`, `executeFeatRoll`, `executeInitiativeRoll`, `executeAwardXp`, `executeTakeRest` |
| The schemas | `app/misc/gmTools.ts`, about 2061–2160 |
| Tally scoring | `executeRecordChallengeResult`, `gmExecutor.ts` about 2930–2975 (strong_hit / weak_hit / miss only) |
| The damage contract | `app/misc/systems/fantastic-realms/contracts.ts` (J1) |
| The GM's hero line | `formatHeroFeatsState`, `app/misc/ai_staged.ts` about 523 |
| The player's chips | `app/story/MetersPanel.tsx` |
| Notes and their loader | `app/misc/systems/fantastic-realms/{core,creation,foes,sheet}.ts`, `world/`, `starters/`; loader `app/misc/systems/builtinNotes.ts` |
| Tests | `tests/systems.fantasticRealms.test.ts` (core budget, tables), `tests/systems.fantasticRealms.engine.test.ts`, `tests/toolBudget.test.ts` (a system story's list under 10,000 + 1,500) |

## E1 — the engine

### State (`structs.ts`)

All new fields are optional, so old saves load unchanged and
`ensureStoryDataArrays` needs no backfill.

```ts
interface HeroFeat {
  id: string; wording: string; burned: boolean;
  kind?: "skill" | "spell" | "item";          // absent = skill
  qualities?: ItemQuality[];                   // items only, at most 2 (a wonder)
  status?: "broken" | "lost";                  // items only
}
type ItemQuality = "keen" | "sturdy" | "warded" | "swift" | "bright" | "cursed"
  | "hardy" | "silent" | "blessed" | "returning" | "masterwork" | "heirloom";
interface HeroCondition { word: string; cure?: string; scar?: boolean }
interface FantasticRealmsHero {
  name?: string; feats: HeroFeat[]; rewards: string[];
  conditions?: HeroCondition[];
  uses?: Record<string, number>;               // "<featId>:scene" etc. → uses spent
}
interface FantasticRealmsState {
  heroes: Record<string, FantasticRealmsHero>; realm?: string;
  partyFeats?: HeroFeat[];                     // hearth improvements (decision 256)
  teamBurnsUsed?: number;                      // reset by a party rest
  partyUses?: Record<string, number>;          // "<partyFeatId>:adventure"
}
```

The six qualities beyond the design's table are named here so the type is
closed. E2's *FR — Gear* note defines all twelve. Only **Keen** (damage) and
**Swift** (initiative) change engine numbers. **Warded**, **Bright** and
**Hardy** are counted uses. The rest are fiction, read by the GM.

### Pure rules (`engine.ts`, new exports)

- **`isDown(hearts, conditions)`**: hearts at 0, or three conditions that are
  not scars. Down is derived, never stored: raising hearts or clearing a
  condition lifts it, which is how a healing spell works (decision 254).
- **`featUsable(feat)`**: `{ ok } | { reason }`. Refuses a burned feat, a
  broken item and a lost item. The one check `frResolveFeats` calls, so
  `feat_roll`, `initiative_roll`, helping and team burns agree (§14).
- **`poolSize({ feats, helped, hindrances, teamBurn })`**:
  - base 1, plus 1 per feat, plus 1 for a helper;
  - minus 1 per hindrance, never below 1;
  - a team burn's two feats add no dice (decision 255).
- **`attackDamage(result, qualities)`**: `foeDamage(result)`, plus 1 on a
  strong hit with a Keen item. Exported for `contracts.ts`.
- **`tallyScore(tier)`**: miss −1, weak 0, hit +1, strong +1 (§14).

### `manage_feats` (`gmTools.ts`, `gmExecutor.ts`)

Today's `action` is `add | rename | remove`. Added:

| action | params | does |
|---|---|---|
| `add` | `kind?`, `qualities?` | as today, with the kind and qualities stored |
| `burn` | `feat` | burns without a roll: a miscast that costs the spell |
| `break` / `lose` / `recover` / `mend` | `feat` | item status. The item keeps its id, qualities and burn state; `mend` does not un-burn |
| `add_condition` | `condition`, `cure?` | stores the word once (a second add says "already") |
| `clear_condition` | `condition` | refuses to clear a scar |
| `add_scar` | `condition` | a scar; only offered when the hero is down |
| `scar_to_feat` | `condition`, `new_wording` | turns a scar into a feat (the level's feat) |
| `use` | `feat`, `per: scene \| rest \| adventure`, `limit?` | spends a counted use (Warded, Bright, a calling move); refuses past the limit (default 1) |
| `add_party_feat` / `remove_party_feat` | `feat` | hearth improvements; `hero` is not required |

Each result's context line ends with the hero's state, as today:
`Bryn — feats: …; conditions: …; down`.

### `feat_roll`

New params, all optional:
- `kind` is not a param: magic is detected from the named feats (`kind === "spell"`).
- `hindered_by: string[]`: condition words on the roller. An unknown word is
  refused, the same as an unowned feat.
- `help: { hero: string; feat: string }`.
- `team_burn: { hero: string; feat: string; own_feat: string }`: the partner
  and their feat, plus the roller's own feat to burn.

Checks, in this order (a refusal writes nothing):
1. The roller exists and is not down.
2. Every named feat passes `featUsable`. `burn` and `team_burn` are not both
   given.
3. The helper is another hero, not down, and their feat is usable.
4. A team burn's partner is not the roller. `teamBurnsUsed` < 2.
5. Every `hindered_by` word is one of the roller's conditions.

Then:
- The pool is rolled as today, sized by `poolSize`.
- The successes are counted, plus the sure successes: 1 for a burn, 2 for a
  team burn.
- Burns, `teamBurnsUsed` and the helper are recorded only after the faces
  exist (as today).

The result gains:
- `damage`: from `attackDamage`, on a hit, when a `target` is named;
- `magic: true` and, on a miss, the line `[Miscast: this was magic. Its cost
  is a miscast from the realm's table]`;
- `helper?`, `teamBurn?` and `hindrances?`;
- `[Cost budget: one heart or condition (two with a harm word), shared by
  everyone in this roll]` on a miss or weak hit.

`contracts.ts` switches from `foeDamage(result)` to `result.damage`.

### Other tools

- **`initiative_roll`:**
  - edge feats go through `featUsable`;
  - a hero who is down is refused;
  - a usable Swift item counts as an edge.
- **`take_rest`:**
  - **heals and un-burns** as today;
  - **conditions:** clears those with no `cure` and no `scar`, and keeps
    *Hungry* until a meal (the condition carries `cure: "a meal"`);
  - **use counters:** resets the `:rest` ones;
  - **team burns:** a rest that includes every hero in the state is a party
    rest, and resets `teamBurnsUsed`. The result says which kind of rest it
    was.
- **`increment_scene`:** resets every `:scene` counter. A small hook in
  `toolExecutor`, keyed on the system state existing, so it is a no-op
  elsewhere.
- **`end_session`:** resets the `:adventure` counters and `partyUses`.
- **`record_challenge_result`:** accepts `hit` when the story runs Fantastic
  Realms, scored by `tallyScore`. The error text names `hit` only for those
  stories.

### Supplies

- The system's `meterSets` gains **"Fantastic Realms party"**: Supplies, owner
  `world`, 0–6, starting at 3.
- The GM makes it with `manage_meter create_set` on the first journey, as the
  hero set is made today.
- *Hungry* is a condition the GM adds at 0, guided by the core note. The engine
  does not watch the meter.

### What the GM and the player see

- **`formatHeroFeatsState`:**
  - an item gets `(broken)`, `(lost)` or its qualities;
  - each hero gets `conditions:` and `scars:`, and `DOWN` when down;
  - a `Party:` line lists the party feats and the team burns left.
- **`MetersPanel.tsx`:**
  - condition chips use `ys-danger`, scars `ys-muted`;
  - a broken item is struck through, a lost one hidden;
  - a Down badge.
  - **UI:** this is a UI change, so it gets a browser screenshot.

### Budgets and the six places

- No tool is added. `manage_feats` and `feat_roll` grow their schemas.
- `tests/toolBudget.test.ts` keeps the system list under 11,500, measured.
  If the descriptions push past it, the long text moves from the descriptions
  into the core note (E2).
- Schemas stay bare where they can: `action` is an enum with a one-line
  description, and the long text sits in the core.
- Labels (`gmToolLabels.ts`) and `GOOGLE_ESSENTIAL_TOOLS` are unchanged, since
  the tool names don't change. `tests/gmTools.sixPlaces.test.ts` still holds.

### E1 tests (`tests/systems.fantasticRealms.engine.test.ts`, a new `…grown.test.ts`)

- `isDown`, `featUsable`, `poolSize` (floor 1, team burn no dice), `attackDamage` (Keen), `tallyScore`.
- `manage_feats`: each action; a condition stored once; scars survive
  `clear_condition` and `take_rest`; an item's identity survives `lose` then
  `recover`; mending does not un-burn.
- `feat_roll`:
  - every refusal writes nothing;
  - a hindrance removes a die and the floor holds;
  - a help adds a die, and a down helper is refused;
  - a team burn gives two sure successes and no dice, the roller can't be the
    partner, the third is refused, and only a party rest resets it;
  - the miscast line appears on a magic miss.
- `contracts.ts`: Keen damage passes without a flag.
- `take_rest`: a partial rest leaves `teamBurnsUsed`, and *Hungry* stays.
- `record_challenge_result`: `hit` scores +1 only in Fantastic Realms.
- The three counters reset on their own events.
- `tests/party.redaction.test.ts`: the phone view gets no hero conditions it
  shouldn't. Today it gets the hero's own meters only; extend the check to the
  new fields.
- Old saves: a Fantastic Realms story saved before E1 rolls exactly as before
  (same pool, same result text apart from the added lines).

## E2 — the rules notes and the note update

### The notes

- **New files** in `app/misc/systems/fantastic-realms/rules/`, one note each:
  - `magic.ts`, `gear.ts`, `conditions.ts`, `callings.ts`, `bestiary.ts`;
  - `legends.ts` (filled in E4), `travel.ts`, `downtime.ts`, `group.ts`.
- **Gathered** in `index.ts`'s rules pack, type `mechanics`, read on demand.
- **`core.ts` is rewritten** with an operational section: down, the harm
  budget, burns and team burns, helping, healing, conditions, the miscast
  rule, and an index line for each new note. It stays under 3,000 tokens
  (test).
- **`creation.ts`** gains the callings step hint ("a calling's kit, or a
  freeform hero's personal move"). `sheet.ts` gains Conditions, Scars and Items
  lines.

### Updating stories that already hold the old notes

The loader never replaces a note a story holds, so this slice adds that
update. In `builtinNotes.ts`:

- **`BUILTIN_NOTE_HISTORY`:** for each built-in note id, the FNV hash
  (`hashNotes`'s function) of every content it has shipped with.
- **The update.** On load, a held built-in note whose content hashes to an
  *earlier* shipped version is replaced with the current one. That means the
  player never edited it. This includes the pinned core, the one case the
  loader now touches a pinned note.
- **Edited notes stay.** A note the player edited is left alone, with a Debug
  Logs line ("Fantastic Realms core is the player's own edit; the new rules
  were not applied").
- **Persistence.** The update persists with the next save, like the missing
  notes today.
- **Scope.** It applies to every built-in system. Blood & Bone's notes get
  their history recorded too: their current hash only, so nothing changes for
  them.

### E2 tests

- The token budgets: the core under 3,000; each rules note under the 2,500
  read cap.
- The core names every tool and every `manage_feats` action.
- `checkTableShape` on every table note.
- The update:
  - an unedited old core becomes the new one;
  - an edited core is kept;
  - a story without the system is untouched;
  - Blood & Bone is byte-identical.

## E3 — the original three realms grown

`world/realms.ts` is split into one file per realm under `world/realms/`, ids
unchanged. Each realm gets:
- "Magic here" and a d12 miscast table;
- its two local callings;
- foes up to 12, in the stat-line form with tactics;
- a treasure d20 and an "On the road" d20.

`world/tables.ts`'s treasure table grows. The tests are table shape, token
caps, and that every foe line parses (`foes.ts`'s format).

## E4 — three new realms and the six legends

- **New realms:** `world/realms/thornmere.ts`, `emberhold.ts`, `hollow-sky.ts`,
  in the same shape as E3.
- **Rests:** `BuiltinSystem.rests` gains `thornmere`, `emberhold` and
  `hollow-sky`, so `take_rest` knows them.
- **Legends:** `rules/legends.ts` holds the six. Each has phases (a heart mark,
  DC, words and threat) and a lair.
- **Loader:** the realms ride in the cross-setting pack, so the loader offers
  them to existing Crossroads stories.
- **Tests:** shape, token caps, and the phase marks in descending order.

## E5 — the starter

- **Wolfwillow Crossing:**
  - its presets get callings;
  - its plan gets a journey (with the Supplies set) and a legend hook;
  - its own notes are read again against the new core.
- **Checks:**
  - `tests/systems.fantasticRealms.test.ts` holds the starter;
  - a browser screenshot of the Meters panel in a seeded Fantastic Realms
    story, showing conditions, a broken item and Down;
  - an APK.

## What can break, and who notices

| Risk | Guard |
|---|---|
| The tool list passes 11,500 | `toolBudget.test.ts`; move text into the core |
| The core passes 3,000 | its token test; move detail into the rules notes |
| An old Fantastic Realms story rolls differently | the old-save test in E1; every new param is optional |
| The note update overwrites a player's edit | the hash history; a test with an edited core |
| Blood & Bone moves | the update test, plus `tests/systems.bloodAndBone.test.ts` unchanged |
| A story without a system sees anything new | `campaign.oldSaves` digests unchanged (the system prompt is untouched) |
| The foe-damage contract mis-fires with Keen | the contract test reads `damage` |
| Hindrances or help are mis-applied by the GM | refusals name the reason. How a real GM handles it needs a live run: `pending_tests.md` |

## Decisions made during implementation

### 2026-10-25 — E1 (the engine)

Judgment calls the plan left to the builder. None changes the plan's scope.

- **`hit` is in the shared `record_challenge_result` enum.** The tool list is
  one stable list for every story (decision 92), so the enum cannot differ per
  story; it gained `"hit"` (about 2 tokens, for every story). The executor
  refuses `hit` outside Fantastic Realms (a story whose resolved system lists
  `feat_roll`), naming only `success`/`failure` or `strong_hit`/`weak_hit`/`miss`.
  In a Fantastic Realms `first_to` challenge a `hit` counts as a success.
- **`manage_feats`' schema no longer requires `hero` and `feat`** (only
  `action`): the party-feat actions need no hero and the condition actions need
  no feat. The executor still refuses a missing one with the old messages.
  `qualities` is `string[]` in the schema and validated in the executor
  (the twelve words are listed in its error), to keep the schema bare.
- **A team burn's `own_feat` that is also named in `feats` is not counted as a
  die** (no refusal): neither burned feat adds its die (decision 255), and a
  wasted round on a refusal costs more than the leniency.
- **The team-burn partner may be the helper** (design 14) but not with the
  same feat in the same roll (refused).
- **Magic is detected from the roller's pool feats and their own burned feat**,
  not from a helper's or partner's feat.
- **The helper writes nothing.** Their feat adds a die and is named in the
  result; it is not burned (design 9), so the "helper written after the
  faces" step has nothing to persist.
- **The damage line is unchanged.** `[If this struck a foe: it loses N hearts]`
  stays verbatim (with ` (Keen +1)` when it applies), so an old save's roll
  text is identical. The result's `damage` is set only on a hit that names a
  `target`; `contracts.ts` reads it and falls back to `foeDamage` for a result
  without one.
- **Down is derived with unknown hearts counting as not down.** A hero with no
  Hearts meter is down only by three conditions.
- **A duplicate condition succeeds with "already … nothing changed"** (design
  14: "giving it again does nothing"); a duplicate feat still fails. `add_scar`
  refuses a hero who is not down, and a scar does not lift the Down state
  (hearts or the third condition do that). `Hungry` is given `cure: "a meal"`
  by the engine when the GM adds it without one, and `take_rest` also keeps a
  hand-set `Hungry` with no cure.
- **`use`** counts a hero's feat by its id, a hearth improvement by its party
  id (`partyUses`), and any other name (a calling's move) under a `~` plus the
  normalised words. A broken or lost item refuses a use; a burned one does not
  (Warded and Bright are qualities, not dice). An adventure's end clears every
  `partyUses` counter and a scene's end only the `:scene` ones; a rest clears
  a hero's `:rest` counters for the heroes who rested, and `partyUses`
  `:rest` counters only at a party rest.
- **A party rest** is a `take_rest` whose picked heroes include every hero in
  `systemState.fantasticRealms.heroes`. The result always says "Party rest"
  or "Partial rest" with the team burns left, and names any hero still down
  (three cure-needing conditions) after it.
- **The hero line's `Party:` line** appears only when the party has feats or a
  team burn has been spent, so a story with neither reads as before.
- **The Meters panel** hides a lost item, strikes a broken one through in
  `ys-danger` (a burned one stays struck through and dimmed), and shows
  qualities in `ys-muted`. Party feats are not shown on the panel (E1 lists
  conditions, items and Down only).
- **`useKey` is `usageKey`**: a function named `use…` trips the hooks lint
  rule in a non-component.
- **Tool budget:** the Fantastic Realms list grew from 11,118 to 11,443 tokens
  (the system extra from +1,139 to +1,462 of the 1,500 allowed). No schema
  text had to move into the core note, but there is 57 tokens of room left.

### 2026-10-25 — E1 engine-review fixes

`engine-review` found nothing blocking; these were fixed, each with a test in
`tests/systems.fantasticRealms.grown.test.ts` ("engine review fixes").

- **`retire` / `rejoin`** (two enum values on `manage_feats`, `hero.retired`).
  A retired hero is kept for history but is out of the party-rest test, the
  default selections of `award_xp` and `take_rest` (naming one is refused),
  `feat_roll` (as roller, helper or partner), `initiative_roll`, the hero line
  and the Meters panel chips. Without it a dead hero would stop team burns
  renewing for good. The "Partial rest" line now names who did not rest.
- **`add_condition` / `add_scar` refuse a name with no hero record**, as
  `clear_condition` does, so a Frightened Goblin never becomes a hero.
- **Keen reads the same set as the magic check** (the pool feats plus the
  team-burned own feat), so listing that item in `feats` or not gives the
  same damage.
- **Down is read one way.** The hero line and the Meters panel use
  `findMeter(meters, owner, "Hearts")`, as the executors do.
- **Removing a feat drops its `uses`** (keys starting with `<id>:`), so a
  reused id starts clean.
- **`use`'s limit is fixed by the first use**, stored beside the counter as
  `<id>:limit:<per>` (so it resets with it); a different limit later is
  refused until the counter resets; omitting it uses the stored one.
- **Spec notes.** "Per adventure" resets at `end_session`, so in practice it is
  per session. `manage_feats burn` on a hero who is down stays allowed: it is
  the GM applying a miscast cost, not the hero acting.
- **Tool budget after the fixes:** 11,449 tokens against the 11,500 limit
  (+1,468 of the 1,500 system extra); 51 tokens of room.

### 2026-10-25 — E2 (the rules notes and the note update)

Judgment calls the plan left to the builder. None changes the plan's scope.

- **The history lists every shipped text, current last** (`builtinNoteHistory.ts`,
  generated once from the notes themselves): the older hash then the current one
  for the FR core and creation note, only the current hash for every other note
  of every system (Blood & Bone's too, as the plan says). `tests/systems.noteUpdate.test.ts`
  fails when a list does not end on the current text, so a later change to a
  note must append its hash. The hash is `hashNotes` over the content alone
  (`hashNoteContent`), so it does not depend on the title.
- **The pre-E2 texts are frozen in `tests/helpers/frPreE2Notes.ts`**, so the
  tests update a story holding the real old core and creation note, not a
  stand-in. The creation note changed too (a callings line), so it has a history
  of two; no other FR note changed text.
- **The "player's own edit" line is logged only for a note whose history has a
  newer version** (more than one entry). A Blood & Bone note that differs from
  its single recorded hash is silent, because it may be an older release rather
  than an edit, and nothing could be applied to it anyway.
- **`updateBuiltinNotes` is separate from `addMissingBuiltinNotes`** and
  returns `{ updated, keptEdited }`; the story page runs it first and writes
  the Debug Logs lines (the module stays free of the logger). It replaces only
  `content` (title, `on`, type, tags and keys are kept), and does nothing to a
  story that is not kept up to date (no core held, or the system tools off).
- **The nine rules notes are `mechanics`, not `table`.** The spell, quality,
  condition and word lists are prose lists, so `checkTableShape` has no new
  notes to check; the four existing tables still pass it. The realms' d12
  miscast tables are E3's.
- **The plan's "FR — Core rules" must name every tool and every `manage_feats`
  action**, so section 4 lists the actions it does not teach elsewhere in one
  line (rename, retire, rejoin, add_party_feat, remove_party_feat,
  clear_condition). The test reads the actions from the live schema.
- **Calling moves lean on what the engine has:** `manage_feats use` per rest to
  count a move, `clear_condition` and `mend` for the ones that clear or mend,
  and a DC one lower (never under 2) for the two that help a roll, because the
  core already lets the GM move a DC by 1. No move needs a new tool parameter.
- **A calling kit is the signature plus three of five** (design 14), so the note
  and the creation hint say so, and a freeform hero's personal move is counted
  the same way.
- **Hardy, Warded and Bright are the counted qualities** (`use`, per rest, scene
  and scene); Cursed spends the harm budget; Keen and Swift are the engine's.
  The other six are fiction the GM reads, each with a plain rule in FR — Gear.
- **Sizes (cl100k):** core 2,256 (limit 3,000); Magic, Gear, Conditions,
  Callings, Bestiary, Legends, Travel, Downtime and Group play are printed by
  `tests/systems.fantasticRealms.rules.test.ts`, all under 2,500.

### 2026-10-25 — E2 engine-review fixes

- **The history is the full shipped record.** It was rebuilt by extracting
  `app/misc` at each of the 40 commits on master that touched
  `app/misc/systems`, loading `BUILTIN_SYSTEMS` there and hashing every note
  text (oldest first, current last). The FR core now has three entries (the
  first release, bcc2c735, hash `85639573ad5c6de4-7118`; the pre-E2 text; the
  current one), so stories started on the first release update. **Blood & Bone
  is no longer "current hash only":** 60-odd of its notes changed on master
  since they first shipped, so an older story that never edited one now gets
  the current text on load (an edited one is kept, with the Debug Logs line).
  That is the intended behaviour of the update, and the one change to B&B
  stories this slice makes. The first-release core is frozen in
  `tests/helpers/frPreE2Notes.ts` (`FIRST_RELEASE_CORE`) and tested.
- **A hit that cannot hurt a foe leaves `target` out of the `feat_roll`**
  (Bestiary strange words, and one line in the core), because a roll that names
  a foe is owed damage by J1's `foe-damage` contract. Test: the contract stays
  silent for a landed roll with no target.
- **Realm sections are hedged** in Magic and Callings (and Travel's road
  tables) as arriving with the realms in a later release (E3).
- **Travel** says rounds = the days, 2 to 5 (a one-day trip is one roll).
  **Downtime's** away-from-hearth `use` names the `hero`.

### 2026-10-25 — E3 (the original three realms grown)

Judgment calls the plan left to the builder. None changes the plan's scope.

- **Two notes per realm, not one.** Each realm note (look, people, places,
  troubles, Magic here, Local callings, twelve foes) is 1,600 to 1,700 tokens,
  under the 2,500 cap; the miscast d12, treasure d20 and road d20 live in a
  separate tables note per realm, `builtin:fantastic-realms:realm-<id>-tables`
  (type `table`, 1,060 to 1,120 tokens). The three new ids are in the
  Crossroads pack, so the loader offers them to existing stories. The realm
  note ids are unchanged.
- **Tactics are a second line** (`*Tactics:* ...`) under each foe, as the
  Bestiary shows, so the stat line stays the one the old parser reads. 12 foes
  per realm: four new each (Beacon-Moth Swarm, Glass Sentinel, Court Poisoner,
  Halcyon Wyvern; Bramble Imp, Thornback Boar, Hedge-Folk Tithe-Taker, Scarecrow
  of the Last Furrow; Grave-Robber Crew, Gibbet Crow Flock, Fog Stalker, Hollow
  Bishop). The XP follows the scale; `Pale Magistrate` keeps its DC 5 / 3 hearts
  / 1000.
- **The local callings follow the Callings format** (signature, kit of five,
  path of eight, a move) with moves that need no new engine: *Under Truce* and
  *Light the Lamp* and the rest are played in fiction, as the twelve are.
- **Treasure rows carry XP and, for items, the item feat and its quality**; the
  last two rows of each realm's d20 are wonders. A one-use marvel that lifts a
  hero who is down is "back to 1 heart", per decision 254.
- **`checkTableShape` accepts a d12** (`tests/helpers/tableShape.ts`), since the
  miscast tables are d12 and the shared foes table is now three d12s (it grew
  from d6 to cover the new foes, and the shared treasure gained a d12 "Items
  with a quality" table and four more great finds, d6 to d10).
- **Edits to E2's notes:** Magic, Callings and Travel no longer say the realm
  content "arrives in a later release"; they point at the realm notes. Each
  changed note, and the shared foes and treasure tables, has its new hash
  appended to `BUILTIN_NOTE_HISTORY` (previous hashes kept); the three new
  tables notes start a history of one.
- **Tests:** `tests/systems.fantasticRealms.realms.test.ts` (new); the
  realm-foe test in `systems.fantasticRealms.test.ts` now expects exactly 12
  and seven table notes; the "hedges" test in the rules test now checks the
  pointers.

### 2026-10-25 — E4 (three new realms and the six legends)

Judgment calls the plan left to the builder. None changes the plan's scope.

- **E3's shape, exactly.** Each new realm is a realm note (1,600 to 1,660
  tokens) and a tables note (1,045 to 1,095 tokens, type `table`): Thornmere's
  callings are the Fen-Pilot and Bell-Diver, Emberhold's the Forgewright and
  Ash-Delver, the Hollow Sky's the Sky-Rigger and Cloud-Reader; twelve foes
  each (five mooks, five champions, one at 5 hearts, one legend), a tactics
  line under every one. The Hollow Sky's realm id is `hollow-sky` (the rest key
  `take_rest` matches), and its note says to pass that id. Titles: "FR —
  Thornmere", "FR — Emberhold", "FR — The Hollow Sky" (and "... tables").
- **Legends (1,720 tokens, under the cap).** Six, one per realm. The first line
  of each is the realm roster's last line verbatim (DC 6, 6 hearts, XP 6000),
  which the plan's old "first phase is DC 4 or 5" building rule contradicted, so
  the stub's rule was rewritten: a later phase may be easier to hit and still
  worse to face. Marks follow the 6-heart rule (phase 2 at 4, phase 3 at 2; the
  Weeping Colossus has two phases, mark 3). Each legend has a lair and a
  weakness, the weakness lowering the DC by 1 for a scene or ending a threat.
  The phase line format is `**Name, Phase n** — DC n · Words · Hearts mark (m) ·
  Threat: ...`, the one FR — Bestiary already documents.
- **The core's rests line names the new realms** (and `hollow-sky`), a pinned
  note change of about 60 tokens (2,320 against 3,000), so the GM can pass the
  right id; the history of the core gained its fourth hash and
  `tests/systems.noteUpdate.test.ts` expects four. Magic, Callings, Travel and the
  Crossroads note (now "The six realms") also changed; the shared foes table
  grew three d12s. Each changed note's new hash is appended (earlier hashes kept);
  the six new notes start a history of one.
- **Tests:** `tests/systems.fantasticRealms.legends.test.ts` (new: rests, the pack,
  the foes table, the history, the legends' token cap, one legend per realm,
  descending marks); the E3 realm test's regexes now accept a multi-word realm
  name (`[\w ]+`), the local-callings list has six entries, and table notes are
  ten.
