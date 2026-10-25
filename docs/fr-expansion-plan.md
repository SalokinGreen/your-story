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

(Filled in by the builder, dated.)
