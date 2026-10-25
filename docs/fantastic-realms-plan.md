# Fantastic Realms — implementation plan

**Design:** [`fantastic-realms-design.md`](fantastic-realms-design.md),
approved by the author ("Build it", decision 219). Decisions 201–219.

This plan says which files change, with which signatures, in what order, and
what each slice must not break. The section numbers (§) refer to the design.

**Baseline before slice 1:** master at `68f3cf7b`, Vitest 211 files / 3,427
tests, tsc clean.

## Slice order and who builds it

| Slice | What | Files | Builder |
|---|---|---|---|
| 1 | Systems plumbing | `systems/types.ts`, `resolve.ts`, `builtinNotes.ts`, `setupSteps.ts`, `ai_staged.ts`, `providerCall.ts`, `localStoryManager.ts`, `structs.ts` | implementer (Sonnet) |
| 2 | The Fantastic Realms engine | new `systems/fantastic-realms/engine.ts`, `gmTools.ts`, `gmExecutor.ts`, `metersAndTracks.ts`, `observer.ts`, `generation.ts`, `historyStubs.ts`, `gmToolLabels.ts`, `providerCall.ts`, `ai_staged.ts`, `structs.ts`, `MetersPanel.tsx` | the same implementer, after slice 1 |
| 3–5 | The content: rules pack, world pack, starter | new files under `app/misc/systems/fantastic-realms/` only | a second implementer, in parallel, in its own worktree |
| 6 | Registration, docs, checks | `systems/index.ts`, `CLAUDE.md`, `pending_tests.md`, the devlog | this session |

**Why this order:**
- **Slices 1–2 run in sequence.** They share `ai_staged.ts`, `providerCall.ts`
  and `structs.ts`.
- **Slices 3–5 run alongside them.** They touch only new files, so they build
  against the interface below and the slices merge without overlap.
- **Slice 6 is the only place the system is registered.** Until then nothing
  is offered to a player.

## The interface both halves build against

These are fixed here so the content half can be written before the engine
lands.

```ts
// app/misc/systems/types.ts — additions to BuiltinSystem
interface BuiltinSystem {
  // ...existing fields...
  tools: string[];            // the GM tools a story of this system is offered
  coreNoteId: string;         // holding it keeps the system's notes up to date (builtinNotes.ts)
  defaultSetting?: string;    // what an unset systemState.setting means
  crossSettingScope?: string; // the scope of notes every story of the default setting is given
  stepHints?: Partial<Record<string, string>>; // per-system hints for shared creation steps ("history")
  rests?: Record<string, string>; // realm id → rest condition, for take_rest
}
```

Blood & Bone's values reproduce today exactly:
- `tools`: `["manage_meter", "manage_track", "end_session", "action_roll"]`
- `coreNoteId`: `"builtin:blood-and-bone:core"`
- `defaultSetting`: `"europe-by-night"`
- `crossSettingScope`: `"cross-europe"`
- no `stepHints`, no `rests`

Fantastic Realms' values:
- `id`: `"fantastic-realms"`
- `tools`: `["manage_meter", "manage_feats", "feat_roll", "initiative_roll", "award_xp", "take_rest"]`
- `coreNoteId`: `"builtin:fantastic-realms:core"`
- `defaultSetting`: `"crossroads"`
- `crossSettingScope`: `"crossroads"`
- `stepHints.history`: a non-supernatural three-question hint
- `rests`: one entry per realm id

The content half exports one object:

```ts
// app/misc/systems/fantastic-realms/index.ts
export const FANTASTIC_REALMS: BuiltinSystem; // packs, starters, sheetTemplate, creationNoteId,
                                              // creationSteps, meterSets, rests, and the fields above
```

## Slice 1 — systems plumbing (no new behaviour for Blood & Bone)

1. **`structs.ts`, `SystemState`:** add `systemId?: string` (the recorded
   system, design §5.1). It is optional, so old saves stay valid.
2. **`resolve.ts`:**
   - **The resolution order** in `resolveSystem(story, systems)`:
     1. `systemState.systemId` naming a system in `systems`;
     2. else today's rule (the first system owning a held note id).
   - **The return value** gains `tools: string[]`:
     - the resolved system's `tools` when `usesSystemTools` is true;
     - **Blood & Bone's four when `usesSystemTools` is true but no system
       resolved** (the legacy switch, design §5.1);
     - `[]` otherwise.
   - **`SYSTEM_TOOL_NAMES`** stays, as the union of every registered system's
     `tools`, for the six-places test and the Google list.
   - **`recordSystemId(story)`**: sets `systemState.systemId` from today's rule
     when it is unset and a system resolves. It returns true when it wrote.
3. **`localStoryManager.ts`:** call `recordSystemId` next to both
   `seedBuiltinNotesOffered` calls (story start).
4. **`builtinNotes.ts`:** call `recordSystemId` in `addMissingBuiltinNotes` (on
   load, persisted with the next save, like the additions).
   - Replace `BLOOD_AND_BONE_CORE_ID` with `system.coreNoteId`.
   - Replace `EUROPE_BY_NIGHT_SETTING` / `CROSS_SETTING_SCOPE` with the
     system's `defaultSetting` / `crossSettingScope`.
   - Keep the exported constants for the existing tests.
   - `keepsBuiltinNotes` resolves the system first, then checks its core.
5. **`setupSteps.ts`:** `getCreationSteps` applies `system.stepHints[id]` over a
   shared step's hint.
6. **`ai_staged.ts`:** the GM whitelist line (`...(usesSystemTools ?
   SYSTEM_TOOL_NAMES : [])`) becomes `...resolveSystem(storyData).tools`.
7. **`providerCall.ts`:** `GOOGLE_ESSENTIAL_TOOLS` gains the five new
   Fantastic Realms names. They are added now, so slice 2 does not touch this
   list again; a name with no schema is harmless in a filter.

**Tests:**
- Every existing test passes unchanged.
- New `tests/systems.resolve.test.ts`:
  - a recorded id wins over notes;
  - an old save derives and records once;
  - two systems' cores with no record resolve to Blood & Bone;
  - the legacy tools-on switch gives Blood & Bone's four;
  - tools-off gives none;
  - a fake second system's tools are what the GM is offered;
  - the tool list is identical across two turns of the same story.
- `builtinNotes` gets a fake-system case proving the loader follows
  `coreNoteId`.

## Slice 2 — the Fantastic Realms engine

1. **New `app/misc/systems/fantastic-realms/engine.ts`**: pure functions, no
   I/O.
   - `countSuccesses(dice: number[], dc: number): number`
   - `resultFor(successes: number): { tier: "miss" | "weak_hit" | "hit" | "strong_hit"; magnitude: number }`
     - the magnitude is `max(0, successes − 3)`.
   - `foeDamage(r): number`
     - weak 1, hit 1, strong `2 + magnitude`, miss 0 (design §2.6).
   - `levelCost(level): number`
     - `(level + 1) × 1000`.
   - `applyXp(level, xp, amount): { level, xp, levelsGained: number[], heartLevels: number[] }`
     - It carries over level by level.
     - `heartLevels` holds the gained levels divisible by 3.
     - Level is capped at 20, and XP past the cap is kept at that level's cost.
   - `normaliseFeat(wording): string`
     - lower case, spaces and punctuation collapsed.
2. **`structs.ts`**, the new hero state:

   ```ts
   SystemState.fantasticRealms?: {
     heroes: Record<string, { feats: { id: string; wording: string; burned: boolean }[];
                              rewards: string[] }>; // keyed by meterId-style owner key
     realm?: string;
   }
   ```

   The result types are `GMFeatRollResult`, `GMInitiativeRollResult`,
   `GMAwardXpResult`, `GMTakeRestResult` and `GMManageFeatsResult`.
3. **`metersAndTracks.ts`:**
   - **`setMeterMax(meter, max, { raiseCap?: boolean })`**: refuses
     `max < meter.floor`. It moves `cap` with `max` when `raiseCap`, clamps
     `value`, and touches nothing else.
   - **`MeterSet` "Fantastic Realms hero":**

     | Meter | min | max | start |
     |---|---|---|---|
     | Hearts | 0 | 3 | 3 |
     | Level | 1 | 20 | 1 |
     | XP | 0 | 2000 | 0 |

     It goes in the content's `meterSets`, but the engine reads it by name.
4. **`gmTools.ts`:** five schemas, with descriptions kept short (the tool budget):
   - **`manage_feats`**: `{ hero, action: "add" | "rename" | "remove", feat, new_wording? }`
   - **`feat_roll`**: `{ hero, feats: string[], dc: 2–6, burn?: string, reason, dice?: number[] }`
     - `dice` is manual mode only, one face per die, length = 1 + feats.
   - **`initiative_roll`**: `{ heroes: { hero, edge_feats: string[] }[] }`
   - **`award_xp`**: `{ amount, source, heroes?: string[] }`
   - **`take_rest`**: `{ heroes?: string[], realm?: string }`
5. **`gmExecutor.ts`:** the five executors dispatched beside `action_roll`.
   - **`feat_roll`**:
     - validates as design §5.2 (owned, unburned, named once, burn in feats,
       DC 2–6);
     - rolls `${1 + feats.length}d6` through `rollFormulasMaybePhysical`, or
       validates the manual `dice` as `action_roll` does;
     - marks the burn on the working copy only after the faces exist;
     - a refusal goes through `systemErrorResult` (an engine error, not a
       miss);
     - `success` is false only on a miss.
   - **`award_xp`**:
     - reads and writes the hero's Level, XP and Hearts meters (it creates the
       hero set if missing, as `create_set` does);
     - raises Hearts' max and the value by one per `heartLevels` entry;
     - records `source` in `rewards`;
     - refuses a repeated source per hero, crediting the others.
   - **`take_rest`**:
     - sets Hearts to its cap and clears `burned` for the heroes;
     - records `realm` when given;
     - returns `system.rests[realm]`.
   - **`manage_feats`**: keeps ids stable on a rename and refuses a duplicate
     wording.
   - **`initiative_roll`**: rolls one `1d6` per hero through the same dice path.
6. **The places every tool lives:**
   - **`gmToolLabels.ts`:** five labels.
   - **`generation.ts` `DICE_TOOLS`:** add `feat_roll` and `initiative_roll`.
   - **`historyStubs.ts`:** dice results stay whole, so add `feat_roll` and
     `initiative_roll` to the whole-result list.
   - **`observer.ts`:**
     - add `"hit"` to `OutcomeTier`, with the label "HIT (it works)";
     - add `feat_roll` to `OUTCOME_CHECK_TOOL_NAMES`;
     - add a branch in `extractOutcomeVerdicts` mapping miss, weak_hit, hit
       and strong_hit, with the magnitude appended to the verdict text
       ("STRONG HIT +2").
   - **`tests/gmTools.sixPlaces.test.ts`** covers them through
     `SYSTEM_TOOL_NAMES`.
7. **`ai_staged.ts` live block:**
   - `formatHeroFeatsState(story)` adds one line per hero ("Bryn — feats:
     Brave, Quick, Sword (burned), Armor") and the realm. It appears only for
     a Fantastic Realms story.
   - It sits beside `formatMetersAndTracksState`, inside the live block (the
     cache rule).
8. **`app/story/MetersPanel.tsx`:** under a hero's meters, their feats as chips,
   a burned one struck through. It uses `ys-*` tokens only
   (`themeTokensOnly.test.ts`).

**Tests:**
- New `tests/systems.fantasticRealms.engine.test.ts`, with seeded
  `Math.random`:
  - **the arithmetic:** the tiers at 0–6 successes, the damage table, levelling
    across two levels at once and at the cap, hearts at levels 3 and 6;
  - **burning:** burn only on completion; a burned feat refused; base-only
    burn refused;
  - **manual dice:** faces validated;
  - **XP:** a repeated source refused;
  - **rests:** clears burns and heals.
- **The outcome judge:** `observer` sees the `feat_roll` tiers.
- **The tool budget:** a Fantastic Realms story's list stays under the default
  budget plus the system bound.
- **The six-places test** passes.

## Slices 3–5 — the content (prose the author reads in the PR)

Everything lives under `app/misc/systems/fantastic-realms/`, in Blood &
Bone's file conventions.

| Note | Id | Holds |
|---|---|---|
| Rules core | `…:core` (`dm_instructions`, ≤ 3,000 tokens) | Design §6's list. |
| Creation | `…:character-creation` | §2.8, and the per-hero setup line. |
| Foes | `…:foes` | How to write a foe, harm words, the XP scale, with three worked stat lines. |
| Levels | `…:levels` | §2.7. |
| The Crossroads | world pack, scope `crossroads` | Travel between realms, each realm's rest rule in a line. |
| Each of the three realms | world pack, one note each | People, places, troubles and a foe roster. |
| Tables | four `table` notes | Names, foes, treasure (with XP), the road. `checkTableShape` must pass. |
| The starter | `buildStarter(packNotes)` | An arrival opening (decision 197), a secret plan outline, a "Running it" note, three pre-made heroes as presets, its realm's notes. |

The system also carries:
- the sheet template;
- the creation steps (`concept`, `feats`, `realm_tie`);
- `stepHints.history`.

The description ends with the "inspired by" line (decision 215). The text is
original, with no names or text from the inspirations (decision 3).

**Tests** (new `tests/systems.fantasticRealms.test.ts`):
- the core's token budget;
- `checkTableShape` on every table;
- every foe stat line parses as DC, words, hearts and XP;
- the starter holds the core and opens with an intro that never reaches
  `scene.parts` before `start_game` (decision 197).

## Slice 6 — registration and the checks this session runs

1. `BUILTIN_SYSTEMS = [BLOOD_AND_BONE, FANTASTIC_REALMS]` (Blood & Bone first:
   the tie rule in §5.1).
2. **The full suite, tsc and lint**, and `engine-review` on slices 1–2.
3. **The browser preview:**
   - the Library lists Fantastic Realms and its starter;
   - starting it shows the welcome;
   - the Meters panel shows a hero's feats after a scripted `manage_feats`.
4. **The APK** after merge.
5. **The docs:**
   - `CLAUDE.md` (the systems section, the tools, the test count);
   - `pending_tests.md`: one real played session against a model, which is
     the author's go.
6. **A devlog with screenshots.**

## What could break, and what guards it

| Risk | Guard |
|---|---|
| Blood & Bone stories offered different tools | Its `tools` equal today's list, and the existing B&B tests plus the new resolve tests check it. |
| The prompt cache stops hitting | The tool list depends only on the recorded system and the override, and a resolve test checks two turns. |
| An old save switches system | `recordSystemId` derives by today's rule. |
| The Google filter drops the new tools | They are added in slice 1. |
| The tool budget | Its test gets the Fantastic Realms case. |
| A burned feat used anyway | The executor refuses it, and the live block shows burns. |

## Decisions made during implementation

(Filled in as the slices land.)
