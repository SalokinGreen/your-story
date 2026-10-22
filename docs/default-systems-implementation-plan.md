# Default RPG systems — implementation plan

**Status:** written 2026-10-22; **approved by decision 108** (the author,
2026-10-22: "Approved. Also pull from origin and do the token saving + default
system plans."). PR A (slices 1-5) is built on `claude/default-systems-a`;
B and C are not started. It implements
[`default-systems-design.md`](default-systems-design.md), approved by
decision 88; decisions 62–89 are in [`decisions.md`](decisions.md). The
source text for the content slice is
[`blood-and-bone/rulebook.md`](blood-and-bone/rulebook.md) (decision 89).

**Baseline when written** (commit `a6a755c`): `npx vitest run` — 121 files,
**1,797 tests**, all passing. Each slice captures its own baseline (suite and
`npx tsc --noEmit`) before its first edit, as the `verify` skill says.

> **Update 2026-10-22:** the token-savings work builds first (decision 97),
> and its slice 5 ([`token-savings-implementation-plan.md`](token-savings-implementation-plan.md)
> §6) splits the GM prompt into a stable block and a per-turn live block.
> The two state sections this plan adds, `formatMetersAndTracksState`
> (§3.3) and `formatActiveChallengeState` (§5.3), go into the live block
> (`buildLiveBlock`) beside the timers, never into the system message or the
> stable block, or every meter tick would re-price the cached history. The
> `ai_staged.ts` line numbers cited below predate that change; take a fresh
> baseline when this plan is built.

**Who builds it.** Each slice is specified work for the `implementer` agent
(Sonnet) or a fresh session on `claude-sonnet-5-5`, one slice at a time. The
planning session keeps the baselines and reviews each diff. Every slice
that touches `app/misc/` gets the `engine-review` agent before its PR merges.

## 1. Slices at a glance

| # | slice | touches | PR | engine review |
|---|---|---|---|---|
| 1 | Shapes, the pure arithmetic, the registry's skeleton | `structs.ts`, new `metersAndTracks.ts`, new `app/misc/systems/` (types, an empty registry, `resolveSystem`) | A | yes |
| 2 | `manage_meter`, `manage_track`, `end_session` | `gmTools.ts`, `gmExecutor.ts`, `ai_staged.ts`, lists | A | yes |
| 3 | `action_roll` | `gmTools.ts`, `gmExecutor.ts`, lists | A | yes |
| 4 | Tally challenges, and the challenge in view | `gmTools.ts`, `gmExecutor.ts`, `ai_staged.ts`, `toolExecutor.ts`, `toolSchemas.ts` | A | yes |
| 5 | Offering the tools; the Designer and compaction | `ai_staged.ts`, `designer_*`, `storyCompaction.ts` | A | yes |
| 6 | The player's panel | new `app/story/MetersPanel.tsx`, `lore.tsx` | B | no (UI) |
| 7 | Built-ins in the library and import | library components, `LibraryPickerModal.tsx`, `useDesignerSession.ts`, `LoreEditor.tsx`, `AdventureInspector.tsx` | B | no (UI), except the shared merge helper |
| 8 | Blood & Bone's AI edition | `app/misc/systems/blood-and-bone/` | C | yes (the core's tool recipes) |
| 9 | Docs | `CLAUDE.md`, status report, `pending_tests.md`, both design docs | with each PR | — |

**Slice 1 is first** because every other slice reads its shapes and calls its
functions, and it changes no behaviour, so it can land and be tested alone.
Slices 2–4 are independent of each other once 1 exists, and none of them is
offered to the GM until slice 5. Slices 6 and 7 need 5. Slice 8 needs all of
them to be playable, but its text and tests can be written in parallel with
6–7.

**Three PRs**, each merged only on the author's word (decision 5): **A** the
engine (1–5), **B** the screens and the library (6–7), **C** the content
(8). Docs move with each PR (slice 9 is not a separate PR).

## 2. Slice 1 — shapes, the pure arithmetic, the registry's skeleton

### 2.1 `app/misc/structs.ts`

New section after `CountdownTimer` (~line 641), all new `StoryData` fields
optional, so `storyDataDefaults.ts` needs no backfill:

```ts
// ============================================
// METERS, PROGRESS TRACKS, SESSIONS
// docs/default-systems-design.md §4
// ============================================

export interface MeterThreshold {
  at: number; // the label applies at and above this value
  label: string; // "Attention"
  note?: string; // what it means, reported to the GM when crossed
}

export interface Meter {
  id: string; // meterId(owner, name), see metersAndTracks.ts
  owner: string; // a character's name as the GM writes it, or "world"
  name: string; // unique per owner, case-insensitive
  min: number;
  max: number;
  cap: number; // current ceiling: floor <= cap <= max
  floor: number; // current floor: min <= floor <= cap
  value: number; // floor <= value <= cap
  thresholds?: MeterThreshold[];
  resetsAtSessionEnd?: number; // end_session sets value to this
  onlyUp?: boolean; // never falls (Beast)
  hidden?: boolean; // GM state only, not the player's panel
  description?: string;
}

export interface MeterDefinition {
  name: string;
  min: number;
  max: number;
  start: number;
  cap?: number; // defaults to max
  floor?: number; // defaults to min
  thresholds?: MeterThreshold[];
  resetsAtSessionEnd?: number;
  onlyUp?: boolean;
  hidden?: boolean;
  description?: string;
}

export interface MeterSet {
  name: string; // "Blood & Bone character"
  description?: string;
  meters: MeterDefinition[];
}

export type TrackRank =
  | "troublesome"
  | "dangerous"
  | "formidable"
  | "extreme"
  | "epic";
export type TrackKind = "vow" | "condition" | "enemy" | "journey" | "other";
export type TrackStatus = "active" | "fulfilled" | "forsaken" | "cleared";

export interface ProgressTrack {
  id: string; // meterId(owner, name) shape, "track:" prefixed
  owner: string;
  name: string;
  kind: TrackKind;
  rank: TrackRank;
  ticks: number; // 0..40
  status: TrackStatus;
}

export interface MeterDedupKey {
  meterId: string;
  key: string; // the trigger: "sunlight"
  scope: "scene" | "session";
  at: number; // sceneCount or sessionCount when used
}

export interface SystemState {
  // Explicit switch for decision 79, set by hand in the AdventureInspector.
  // Unset means "derive it": a story whose lore holds a built-in system's
  // notes uses that system's tools (systems/resolve.ts).
  usesSystemTools?: boolean;
  sessionCount: number;
  dedupKeys: MeterDedupKey[];
}
```

On `StoryData` (near `timers`, ~line 995):

```ts
  meters?: Meter[];
  progressTracks?: ProgressTrack[];
  systemState?: SystemState;
```

`SceneChallenge` (~line 596) gains:

```ts
  // "first_to" (default, unset on old saves): currentSuccesses/currentFailures
  // against requiredSuccesses/maxFailures. "tally": exactly `rounds` results,
  // strong hit +1 / weak hit 0 / miss -1, summed into `tally`.
  mode?: "first_to" | "tally";
  tally?: number;
  recorded?: number; // results recorded so far, tally mode
```

and its `rounds` comment changes to say that in tally mode `rounds` is the
real count, not a display figure.

**Planning refinement:** the design's meter field `resets` (scene or session)
becomes `resetsAtSessionEnd` only. Blood & Bone uses no per-scene reset, so a
scene reset would be code with no caller; the field name leaves room for a
`resetsAtSceneEnd` later.

### 2.2 New `app/misc/metersAndTracks.ts`

Pure functions, no `StoryData` access, no I/O. Every function returns new
objects; executors write them back into the cloned `StoryData`.

```ts
export const TICKS_PER_MARK: Record<TrackRank, number> = {
  troublesome: 12, dangerous: 8, formidable: 4, extreme: 2, epic: 1,
};
export const TRACK_MAX_TICKS = 40;
export const ACTION_ADDS_CAP = 2;
export const ACTION_SCORE_CAP = 10;

export class MeterError extends Error {} // invalid definitions and calls

export function normalizeKey(s: string): string; // trim, lowercase, collapse spaces
export function meterId(owner: string, name: string): string; // `${normalizeKey(owner)}::${normalizeKey(name)}`
export function trackId(owner: string, name: string): string; // `track:${meterId(owner, name)}`

export function findMeter(meters: Meter[] | undefined, owner: string, name: string): Meter | undefined;
export function findTrack(tracks: ProgressTrack[] | undefined, owner: string, name: string): ProgressTrack | undefined;

export function createMeter(def: MeterDefinition, owner: string): Meter; // throws MeterError on min>max, start outside [floor, cap], etc.
export function createMeterSet(set: MeterSet, owner: string, existing: Meter[]):
  { created: Meter[]; skipped: string[] }; // skipped = names the owner already has

export interface MeterChange {
  before: number;
  after: number;
  requested: number; // the signed change asked for (adjust) or the target (set)
  clampedBy: number; // how much of the request the clamp removed (0 if none)
  crossedUp: MeterThreshold[];
  crossedDown: MeterThreshold[];
  atCap: boolean;
  atFloor: boolean;
}
export function adjustMeter(meter: Meter, by: number): { meter: Meter; change: MeterChange }; // onlyUp + by<0 -> MeterError
export function setMeterValue(meter: Meter, value: number): { meter: Meter; change: MeterChange };
export function setMeterCap(meter: Meter, cap: number): { meter: Meter; change: MeterChange }; // value pulled down to the new cap
export function setMeterFloor(meter: Meter, floor: number): { meter: Meter; change: MeterChange }; // value pushed up to the new floor
export function currentThreshold(meter: Meter): MeterThreshold | undefined; // highest threshold with at <= value

export function isDuplicate(keys: MeterDedupKey[], meterId: string, key: string,
  scope: "scene" | "session", at: number): boolean;
export function pruneDedupKeys(keys: MeterDedupKey[], sceneCount: number, sessionCount: number): MeterDedupKey[]; // drops stale ones

export function filledBoxes(ticks: number): number; // Math.floor(ticks / 4)
export function createTrack(owner: string, name: string, kind: TrackKind, rank: TrackRank): ProgressTrack;
export function markProgress(track: ProgressTrack, times = 1):
  { track: ProgressTrack; ticksAdded: number; boxesBefore: number; boxesAfter: number };
export function halveTrack(track: ProgressTrack): ProgressTrack; // boxes -> floor(boxes/2), ticks = boxes*4

export type RollOutcome = "strong_hit" | "weak_hit" | "miss";
export function resolveAgainstChallengeDice(score: number, c1: number, c2: number):
  { outcome: RollOutcome; match: boolean }; // beats = strictly greater; match = c1 === c2
export function actionScore(die: number, stat: number, adds: number, penalty: number):
  { score: number; addsApplied: number; capped: boolean };
  // addsApplied = clamp(adds, 0, ACTION_ADDS_CAP); score = min(die + stat + addsApplied - penalty, ACTION_SCORE_CAP)
```

`progress_roll` and `action_roll` get their dice from the executor (§3–4),
so this module never calls `Math.random` and every function is a plain
input-to-output test.

### 2.3 The registry's skeleton, `app/misc/systems/`

The shapes and the lookup the engine needs, with no content yet, so slice 2
can resolve meter sets and slice 5 can decide who is offered the tools:

```ts
// types.ts
export interface BuiltinNote {
  id: string; // stable: "builtin:blood-and-bone:core"
  title: string;
  type: LoreType;
  content: string;
  tags?: string[];
  keys?: string[];
  visibility?: LoreVisibility;
}
export interface BuiltinPack {
  id: string; // "blood-and-bone:rules"
  systemId: string; // "blood-and-bone"
  title: string; // "Blood & Bone — Rules"
  description: string;
  notes: BuiltinNote[];
}
export interface BuiltinAdventure {
  id: string; // "builtin:blood-and-bone:hollow-hour"
  adventure: Partial<Adventure>; // storyTemplate.lore holds copies of the packs' notes
}
export interface BuiltinSystem {
  id: string;
  title: string;
  description: string; // one paragraph, also shown to the Designer
  packs: BuiltinPack[];
  starters: BuiltinAdventure[];
  sheetTemplate?: string; // {{Field | description | default}} markdown
  meterSets: MeterSet[];
  endOfSessionReminder?: string; // returned by end_session
}

// index.ts
export const BUILTIN_SYSTEMS: BuiltinSystem[]; // [] until slice 8 adds Blood & Bone
export function isBuiltinId(id: string | undefined): boolean; // startsWith("builtin:")
export function getBuiltinNote(id: string):
  (BuiltinNote & { packId: string; systemId: string }) | undefined;

// resolve.ts
export const SYSTEM_TOOL_NAMES = ["manage_meter", "manage_track", "end_session", "action_roll"];
export interface ResolvedSystem {
  system?: BuiltinSystem;
  usesSystemTools: boolean;
  meterSets: MeterSet[];
  endOfSessionReminder?: string;
}
export function resolveSystem(storyData: Pick<StoryData, "lore" | "systemState">): ResolvedSystem;
```

`resolveSystem`: the system is the one whose built-in note ids appear as
`libraryNoteId` on the story's lore (first match); `usesSystemTools` is
`systemState.usesSystemTools` when set, else `true` if a system was found.

**Planning refinement:** the design had the pack set a flag on import.
Deriving the system from the lore's `libraryNoteId`s instead means every
import path (the Designer, the lore editor, "Attach & Start", the starter)
turns the tools on with no extra plumbing, and an author who deletes the
pack's notes turns them off. The hand switch (decision 79) is the explicit
override.

### 2.4 Tests

`tests/metersAndTracks.test.ts`: clamping at cap and floor, `clampedBy`,
`onlyUp` refusal, threshold crossings both ways, `setMeterCap` pulling the
value down (Stress 6 → cap 5 gives 5), `createMeterSet` skipping existing
names, dedup by scope and `at`, ticks per rank for all five ranks, clamping
at 40, `halveTrack` (7 boxes → 3), `resolveAgainstChallengeDice` on ties
(score 5 vs 5 and 3 → weak hit), on a match, and `actionScore` capping adds
and the score (6 + 3 + 3 adds → 10, adds applied 2).
`tests/systems.resolve.test.ts`: with a test-only system passed in (the
registry is empty until slice 8), no system → tools off; one of its note ids
as a `libraryNoteId` in lore → on, with its sets; `usesSystemTools: false`
overrides. `resolveSystem` takes the registry as an optional second
parameter (default `BUILTIN_SYSTEMS`) so the test needs no mock.

## 3. Slice 2 — `manage_meter`, `manage_track`, `end_session`

### 3.1 `app/misc/gmTools.ts`

Params (beside `ManageTimerParams`, ~line 521), union members (~line 671),
schemas (beside `manageTimerTool`, ~line 2157), and entries in
`GM_TOOL_SCHEMAS` (~line 2643):

```ts
export type ManageMeterAction =
  | "create" | "create_set" | "adjust" | "set" | "set_cap" | "set_floor" | "remove";

export interface ManageMeterParams {
  action: ManageMeterAction;
  owner: string; // character name, or "world"
  meter?: string; // every action but create_set
  set?: string; // create_set: a set name from the story's system
  by?: number; // adjust: signed integer
  value?: number; // set / set_cap / set_floor; create: start value
  min?: number; // create
  max?: number; // create
  only_up?: boolean; // create
  thresholds?: { at: number; label: string; note?: string }[]; // create
  once_per?: "scene" | "session"; // adjust only
  key?: string; // adjust with once_per: the trigger's name
  reason: string;
}

export type ManageTrackAction =
  | "create" | "mark" | "progress_roll" | "set_status" | "halve" | "set_rank" | "remove";

export interface ManageTrackParams {
  action: ManageTrackAction;
  owner: string;
  track: string;
  kind?: TrackKind; // create
  rank?: TrackRank; // create, set_rank
  times?: number; // mark, default 1
  status?: Exclude<TrackStatus, "active">; // set_status
  dice?: [number, number]; // progress_roll: faces the player reported (manual dice mode)
  reason: string;
}

export interface EndSessionParams {
  reason: string; // "Dawn over Prague"
}
```

The schema descriptions say *what the engine does* (clamps, reports
thresholds, refuses repeats) and leave *when to call* to each system's core
note: the schemas are generic, the core is not.

### 3.2 `app/misc/gmExecutor.ts`

Three executors near `executeManageTimer` (~line 5243), three `case`s in the
switch (~line 1199), and three result types in the `GMToolResult` union
(~line 151):

```ts
function executeManageMeter(toolCallId: string, params: ManageMeterParams, storyData: StoryData): GMToolResult;
async function executeManageTrack(toolCallId: string, params: ManageTrackParams, storyData: StoryData,
  interaction: GMInteractionHandlers): Promise<GMToolResult>;
function executeEndSession(toolCallId: string, params: EndSessionParams, storyData: StoryData): GMToolResult;

interface GMManageMeterResult { type: "manage_meter"; action: ManageMeterAction; owner: string;
  meter?: string; change?: MeterChange; created?: string[]; skipped?: string[]; refusedAsRepeat?: boolean; }
interface GMManageTrackResult { type: "manage_track"; action: ManageTrackAction; owner: string; track: string;
  ticks?: number; boxes?: number; outcome?: RollOutcome; dice?: [number, number]; match?: boolean; }
interface GMEndSessionResult { type: "end_session"; sessionCount: number; reset: string[]; }
```

Rules the executors keep:

- **`success: true` for every valid call**, including a progress roll's miss
  and a refused repeat (`refusedAsRepeat`, with "no change: *key* already
  counted this scene"). `success: false` only for an invalid call (unknown
  owner/meter/set, a fall on an `onlyUp` meter, bad numbers), with
  `[ERROR: …]` naming what exists. So none of the three joins
  `OUTCOME_BEARING_TOOL_NAMES` or `DICE_TOOLS`.
- **"This scene"** is `storyData.agmtState?.sceneCount ?? 0`; **"this
  session"** is `storyData.systemState?.sessionCount ?? 0`. Every `adjust`
  prunes stale keys first.
- `create_set` reads the set from `resolveSystem(storyData).meterSets`
  (slice 1); an unknown set errors with the names that exist.
- `progress_roll` throws two d10s through `rollFormulasMaybePhysical(["2d10"],
  { reason }, interaction)` (~line 2146), so the dice tray works, or uses
  `params.dice` when given (each face 1–10, else `[ERROR]`).
- `end_session` increments `sessionCount` (creating `systemState` if
  missing), sets every meter with `resetsAtSessionEnd` to that value, prunes
  session keys, and returns the system's end-of-session reminder
  (`resolveSystem(storyData).endOfSessionReminder`).
- `contextForStory` lines follow the timers' style: `[Meter: Mira — Stress
  3 → 5 (+2) · reached "Strained"]`, `[Track: Vow "…" — dangerous, 3 → 5
  boxes]`, `[Progress roll: 5 boxes vs 4, 7 → WEAK HIT]`.

### 3.3 `app/misc/ai_staged.ts`

- `formatMetersAndTracksState(storyData: StoryData): string`, beside
  `formatTimersState` (~line 341): one line per owner for meters (`Mira —
  Stress 3/6 (cap 5) · Beast 1/10 · Exposure 2/6 (Rumour)`, cap shown only
  when below max, hidden meters included since this is the GM's view), one
  line per active track. Called at ~line 1280 and inserted after the timers
  at ~line 1897.
- The tools are not added to `legacyToolNames` in this slice; slice 5 offers
  them, only to stories that use them (decision 79). Until then they exist,
  are tested through `executeGMTools`, and no GM can call them.

### 3.4 The lists

| list | file | change |
|---|---|---|
| labels | `gmToolLabels.ts` | "Updating a meter", "Updating a track", "Ending the night" |
| Google filter | `providerCall.ts` `GOOGLE_ESSENTIAL_TOOLS` | add all four system tools. This does not fix §6.14, which still drops the challenge tools Blood & Bone needs on Gemini |
| `STATE_CHANGE_TOOLS`, `DICE_TOOLS` | — | **no change.** `STATE_CHANGE_TOOLS` only feeds notifications on the older state-tool path and an advisory log; these are GM tools with `success: true` outcomes. (Planning refinement of the design's §4.8 list.) |

### 3.5 Tests

`tests/gmTools.manageMeter.test.ts`, `tests/gmTools.manageTrack.test.ts`,
`tests/gmTools.endSession.test.ts`, through `executeGMTools` like
`tests/gmTools.manageTimer.test.ts`: create and adjust with clamping, the
once-per-scene repeat refused and allowed again after `sceneCount` moves,
once-per-session cleared by `end_session`, `onlyUp` errors, unknown names
listing what exists, `mark` per rank, `progress_roll` with seeded
`Math.random` and with `dice` given, `end_session` resets and the reminder.
`tests/aiStaged.metersSection.test.ts` for the state section's lines.

## 4. Slice 3 — `action_roll` (decision 78)

### 4.1 `app/misc/gmTools.ts`

```ts
export interface ActionRollParams {
  stat_name: string; // "Heart"
  stat_value: number; // from the character sheet
  adds?: number; // bonuses claimed; the engine applies at most +2
  penalty?: number; // conditions and the like, subtracted, uncapped
  move?: string; // "Face Danger"
  owner?: string; // whose roll, for the log and party play
  dice?: { action: number; challenge: [number, number] }; // manual dice mode
  stakes?: "low" | "medium" | "high" | "deadly";
  reason: string;
}
```

The description says plainly: the engine applies the caps and decides
strong/weak/miss; report that outcome; on a miss, Pay the Price as the
system's rules say.

### 4.2 `app/misc/gmExecutor.ts`

```ts
async function executeActionRoll(toolCallId: string, params: ActionRollParams, storyData: StoryData,
  interaction: GMInteractionHandlers): Promise<GMToolResult>;

interface GMActionRollResult {
  type: "action_roll"; statName: string; statValue: number; adds: number; addsApplied: number;
  penalty: number; actionDie: number; challengeDice: [number, number]; score: number;
  capped: boolean; outcome: RollOutcome; match: boolean; move?: string; owner?: string;
}
```

- Dice: `params.dice` when given (faces validated), else
  `rollFormulasMaybePhysical(["1d6", "2d10"], { reason }, interaction)`, so
  the physical tray throws all three dice in one toss as `formula_roll` does.
- Score and outcome from `actionScore` and `resolveAgainstChallengeDice`.
- **`success` carries the outcome**: `true` for strong and weak hits, `false`
  for a miss, like `record_challenge_result`. So `action_roll` joins
  `OUTCOME_BEARING_TOOL_NAMES` (`gmExecutor.ts` ~line 817), `DICE_TOOLS`
  (`generation.ts` ~line 152) and the Observer's `OUTCOME_CHECK_TOOL_NAMES`
  (`observer.ts` ~line 1189), and the Observer's outcome check then catches a
  GM narrating a success on a miss.
- `stakes` high or deadly marks the scene exactly as `formula_roll`'s does
  (the `highStakesSceneKey` path near `gmExecutor.ts` ~line 2091).
- `contextForStory`: `[Action roll — Face Danger +Heart: d6 4 + 2 + adds 1 =
  7 vs 3 and 9 → WEAK HIT]`, plus `[MATCH: …]` when the challenge dice match.

### 4.3 The lists

`ROLL_OR_ORACLE_TOOL_NAMES` in `reasoningTiers.ts` (~line 384) **must** gain
`action_roll`, or the M2 gate would demand another roll after every action
roll in a skirmish. Label "Rolling the action". Google filter as in §3.4.

### 4.4 Tests

`tests/gmTools.actionRoll.test.ts`: seeded rolls for each outcome, the
adds cap (adds 5 → applied 2), the score cap, ties to the dice, a match,
`dice` given and invalid, `success` false on a miss, and
`hasSatisfiedRollGate(["action_roll"])` true.

## 5. Slice 4 — tally challenges, and the challenge in view (decision 67)

### 5.1 Remove the duplicate

`toolExecutor.ts` carries a second `start_challenge` implementation (~lines
2288–2357) and `toolSchemas.ts` a second schema (~line 994). Neither is
reachable: the GM switch handles `start_challenge` before falling through to
the state tools, and `stateToolNames` does not offer the state schema. Grep
both names first; remove both; keep `"start_challenge"` in
`STATE_CHANGE_TOOLS` only if a remaining path still emits it (it will not).

### 5.2 `start_challenge` and `record_challenge_result`

```ts
export interface StartChallengeParams {
  name: string;
  description: string;
  mode?: "first_to" | "tally"; // default first_to
  rounds?: number; // tally: 2..10, required
  required_successes?: number; // first_to: required
  max_failures?: number; // first_to: required
  primary_stat: string;
  difficulty: string;
  victory_consequence?: string;
  defeat_consequence?: string;
}

export interface RecordChallengeResultParams {
  outcome: "success" | "failure" | "strong_hit" | "weak_hit" | "miss";
  ...unchanged
}
```

- The schema drops `required_successes` and `max_failures` from `required`;
  `executeStartChallenge` (~line 1508) checks them for `first_to` and
  `rounds` for `tally`, with an `[ERROR]` naming the missing field.
- `executeRecordChallengeResult` (~line 2738) in tally mode accepts
  `strong_hit`/`weak_hit`/`miss` (+1/0/−1), increments `recorded`, and
  closes after `rounds` results with `result` `won` if the tally is ≥ +1,
  `lost` if ≤ −1, and a new `result: "even"` at 0 (`SceneChallenge.result`
  widens to include it; grep every reader of `.result` on a challenge, such
  as `get_game_state`'s challenge block, and make each handle `even`). The
  context line reports the round and the tally, and on close names the band ("Decisive Victory", "Success at a Cost",
  "Defeat" are the system's words, so the engine reports `+1 or more`, `0`,
  `−1 or less` and the core maps them). In first_to mode `strong_hit` and
  `weak_hit` count as success and `miss` as failure, so an Ironsworn-style GM
  can't break a first_to challenge. `success` is false for `miss` and
  `failure`, true otherwise.

### 5.3 The challenge in view

`formatActiveChallengeState(challenge?: SceneChallenge): string` in
`ai_staged.ts`, inserted beside the meters section: `Skirmish "Escape the
tunnels" — tally, round 2 of 3, Advantage +1` or `first to 3: 1 success, 2
failures`. Today the GM sees an active challenge only through
`get_game_state`.

### 5.4 Tests

Extend `tests/gmTools.challengeParity.test.ts`: tally start errors without
`rounds`, three recorded results close it with each band, `even` at 0,
first_to unchanged, first_to accepting hit/miss outcomes, the state line.

## 6. Slice 5 — offering the tools; the Designer and compaction

### 6.1 Wiring

- `ai_staged.ts` adds the system tools to `legacyToolNames`, in the same
  conditional-spread form as `ask_for_roll`'s manual-dice case:
  `...(resolveSystem(storyData).usesSystemTools ? SYSTEM_TOOL_NAMES : [])`.
  The meters and challenge sections from slices 2 and 4 show whenever there
  is something to show, whatever the switch says.
- `storyCompaction.ts` `buildCondensedStorySeed` (~line 300): keep `meters`
  and `progressTracks` (the clone already does) and set
  `systemState.dedupKeys = []`, since a condensed story starts a new scene
  count.
- `designer_executor.ts`: `AdventureDraft.systemState?: Pick<SystemState,
  "usesSystemTools">`; `draftToAdventure` writes
  `storyTemplate.systemState` when set; `adventureToDraft` reads it;
  `summarizeDraft` names the resolved system and its sets.
- `designer_ai.ts`: one paragraph built from `BUILTIN_SYSTEMS` (title and
  description) telling the Designer which built-in rules packs exist and that
  the author imports them from the library.
- `startAdventureLocally` needs nothing: it spreads `storyTemplate`, so a
  starter's `meters`, `progressTracks` and `systemState` arrive in the story.

### 6.2 Tests

The GM tool list from `buildGMStagePrompt` includes the four names for a
story whose `systemState.usesSystemTools` is `true` and excludes them
otherwise (the registry is still empty, so the explicit switch is what the
test sets); `draftToAdventure`/`adventureToDraft` round-trip `systemState`;
`buildCondensedStorySeed` keeps meters and tracks and clears the dedup keys.

## 7. Slice 6 — the player's panel

New `app/story/MetersPanel.tsx`:

```ts
interface MetersPanelProps {
  meters?: Meter[];
  progressTracks?: ProgressTrack[];
  activeChallenge?: SceneChallenge;
}
export default function MetersPanel(props: MetersPanelProps): JSX.Element | null; // null when nothing to show
```

Grouped by owner. A meter is a bar with a cap marker (the part above `cap`
dimmed) and its current threshold label; a track is ten boxes with tick
marks; an active challenge shows its round and tally, or its two counts.
Hidden meters are left out. No `Math.random`/`Date.now` in render; keys from
`meter.id`/`track.id`. Rendered at the top of `LorePage`
(`app/story/lore.tsx`), which already receives `StoryData` as spread props.
Tailwind v4 classes (`bg-linear-to-*` if a gradient is used).

**Cannot be checked in a cloud session**: the screenshot goes to
`pending_tests.md` (§12).

## 8. Slice 7 — built-ins in the library, and import

### 8.1 Showing them

Two converters join `app/misc/systems/index.ts`:

```ts
export function builtinPackToLibraryNotes(pack: BuiltinPack): LibraryNote[]; // fixed timestamps, never Date.now()
export function builtinAdventureToLocal(a: BuiltinAdventure): LocalAdventure; // never saved
```

`LibraryNote` gains `builtIn?: { systemId: string; packId: string }`, set
only by the converter and never stored.

**Planning refinement:** the design merged built-ins into the existing
lists. Those lists come with edit, delete, move-to-folder and rename
handlers in at least five components (`AdventuresLibraryTab`,
`FolderDetailView`, `LibraryHome`, `NotesLibraryTab`, the folder dialogs),
each of which would need a built-in guard. Instead built-ins get places of
their own:

- **`app/library/BuiltinSystemsSection.tsx`** on `LibraryHome`: each system
  with its description, its packs (title, note count, a collapsible list of
  note titles), and its starters with **Play** (sets `pendingPlay` with
  `builtinAdventureToLocal(…)`, the existing flow) and **Open a copy in the
  Designer** (`saveLocalAdventure` under a new `local:` id, then
  `/creator?edit=<id>`).
- **`LibraryPickerModal.tsx`**: a *Built-in* group above the user's folders,
  one virtual folder per pack (`builtin:<packId>`), listing
  `builtinPackToLibraryNotes(pack)` with a *Select whole pack* control. Every
  import path uses this picker, so this is the one place built-in notes need
  to appear.

### 8.2 One import rule for both paths

The Designer dedupes on `libraryNoteId` or a case-insensitive title and
overwrites; the lore editor appends with no dedupe. One helper in
`localNotesLibraryManager.ts`:

```ts
export function mergeImportedLore(existing: StoryLore[], incoming: StoryLore[]):
  { lore: StoryLore[]; replaced: string[]; added: string[] };
// match by libraryNoteId; else by case-insensitive title against notes
// with no libraryNoteId; on a match, { ...existing, ...incoming }
```

used by `useDesignerSession.importFromLibrary` and
`LoreEditor.importSelectedLibraryNotes`. The docstring of
`importFromLibrary` is corrected to match.

### 8.3 What importing a rules pack also does

In `importFromLibrary`, when an imported note resolves to a built-in system
(`getBuiltinNote`) and the draft has no `characterSheetTemplate`, set it from
the system's `sheetTemplate` (`parseTemplateFields`), and say so in the
transcript message. Meter sets need nothing: `resolveSystem` finds them.

### 8.4 Guards

- `LoreEditor.tsx` push to library (~line 198): refuse for a
  `libraryNoteId` that `isBuiltinId`, with "Built-in notes can't be changed
  in the library — save this as a new library note instead". Pull reads
  `getBuiltinNote` for built-in ids.
- `AdventureInspector.tsx`: a checkbox *Use meters, tracks and action
  rolls*, three-state (derive / on / off), writing
  `draft.systemState.usesSystemTools`.
- Facts checked while planning: `sourceAdventureId` in `story/page.tsx` is
  never set (only `useState(null)`), so the four `getLocalAdventure` reloads
  that read it never run and need no built-in lookup. Sync reads only
  IndexedDB, so built-ins never sync.

### 8.5 Tests

`tests/mergeImportedLore.test.ts` (both match rules, flags kept);
`tests/systems.builtins.test.ts` (stable ids, fixed timestamps,
`builtinAdventureToLocal` starts through `startAdventureLocally` and passes
`ensureStoryDataArrays`, a Designer import sets the sheet template).

## 9. Slice 8 — Blood & Bone's AI edition

### 9.1 Files

`app/misc/systems/blood-and-bone/`, each exporting typed constants:

| file | contents |
|---|---|
| `index.ts` | the `BuiltinSystem` (two packs, one starter, sheet, sets, end-of-session reminder) |
| `core.ts` | **B&B — Core rules** (`dm_instructions`), ≤ 3,000 tokens, outline in §9.2 |
| `moves.ts` | **B&B — Moves**: the generic moves, Clean Up, Burn a Connection, Resist the Hunger and Resisting the Change (decision 86) |
| `kinds.ts` | seven **B&B — *Kind*** notes: entry, two archetypes, Beast track, Powers; the decided rules in the right Kind (§9.3) |
| `assets.ts` | **B&B — Paths · Havens · Companions · Relics · Rites**, five notes, with the renames (decision 87) |
| `progress.ts` | **B&B — Progress, vows and XP** (Ch. 11, downtime) |
| `timeSkip.ts` | **B&B — Time Skip and the Turning** |
| `creation.ts` | **B&B — Character creation** (Ch. 7, steps 0–8; the GM reads it in session zero) |
| `tables.ts` | four **B&B — Miss tables: …** and three **B&B — Oracles: …** (`table`, "Roll 1dN:" listings as `tableNotes.ts` renders them) |
| `creationPrompts.ts` | seven **B&B — Creation prompts: *Kind*** (`table`) |
| `sheet.ts` | the sheet template from Appendix B, numbers left to the meters (design §5.9) |
| `meterSets.ts` | "Blood & Bone character" (Stress 0–6 start 2; Beast 0–10 `onlyUp`, thresholds 3/6/9/10; Exposure 0–6, thresholds 3/4/5/6; XP 0–999), "Witch" (Ledger 0–10, threshold 10 "The source's demand"), "Wendigo" (Slipping Mask 0–3, thresholds 1/2/3) |
| `europe.ts` | the setting pack: **Europe by Night — Overview** and six city notes (`lore`) |
| `hollowHour.ts` | the starter: premise and intro; Runa, Callum and Margot as NPCs; *The truth about Runa* as a `secret` note with `visibility: "hidden"`; a `dm_instructions` note **The Hollow Hour — Running it** with the four endings, from which session zero writes the campaign plan as usual; `meters` with world Heat at 3 (thresholds 3/4/5/6); `progressTracks` for its three objectives, owner "Cohort"; `storyTemplate.lore` holding copies of both packs' notes, each with its built-in id as `libraryNoteId` so `resolveSystem` finds the system |

### 9.2 The core note's outline (≤ 3,000 tokens)

1. How this game runs: fiction first; not everything is a move; the GM never
   rolls against players; antagonists have rank, a want and one or two
   abilities, never sheets — **never** `start_combat`, combatant stats or
   `npc_roll`.
2. The action roll: call `action_roll`; outcomes; matches; adds and
   penalties; on a miss, read the move's miss table and roll it, and if no
   consequence fits, Stress +1.
3. Moves at a glance (name, stat), pointing to *B&B — Moves*.
4. Stress: the Kind's triggers at +1, each once a scene, via
   `manage_meter` with `once_per: "scene"` and the trigger as key (decision
   70); a spike is +2 (decision 86); Sate the Beast / Steel the Resolve;
   archetype relief; reaching the cap means the Time Skip (read its note).
5. The Beast Meter: what to do at 3, 6, 9 and 10 (`set_cap`, `set_floor`,
   the lost stat point in the sheet, the Successor).
6. The night (decision 66): call `increment_scene` at every scene change; at
   dawn call `end_session`, run the Reckoning (`formula_roll` of Stress d6,
   count the 1s, raise Beast; decision 80), advance the Wendigo's Mask and
   starving trigger (decisions 84–85), offer two downtime actions.
7. Fights by rank (decision 86) and the Rule of 3 (decision 67):
   `start_challenge` with `mode: "tally"`, `rounds: 3`; one `action_roll`
   per player turn; `record_challenge_result`; the bands and their costs.
8. Progress: `manage_track` for vows, conditions (three at most; a fourth is
   Broken), journeys and Formidable-and-up enemies; `progress_roll` to
   fulfil or clear.
9. Exposure and Heat thresholds; Clean Up.
10. Connections, Burdens, Burn a Connection.
11. XP: a meter; each trigger with `once_per: "session"`.
12. Oracles: `fate_question` for yes/no (decision 68); the book's tables by
    title.
13. Which note to read when — every title it names must exist (tested).

### 9.3 Where the decided rules go

| decision | lands in |
|---|---|
| 66, 70, 80 | core §4, §6 |
| 67, 86 (fights by rank) | core §7 |
| 71, 86 (the Fading's penalty, *The Still Self*) | *B&B — Ghost* |
| 83 (the Ledger) | *B&B — Witch/Warlock*, and the "Witch" meter set |
| 84, 85, 86 (Mask, starving, Predator) | *B&B — Wendigo*, and the "Wendigo" meter set |
| 86 (spike +2, Rogue wording) | core §4; *B&B — Werewolf* |
| 86 (Resist the Hunger, Resisting the Change) | *B&B — Moves* |
| 87 (renames) | *B&B — Rites* (The Calling Due, The Wake), *B&B — Havens* (The Forgotten Room), *B&B — Werewolf* (The Wild) |
| 69 (rewritten text) | already applied in `rulebook.md`; nothing copied back from elsewhere |

### 9.4 Tests

`tests/systems.bloodAndBone.test.ts`, with `estimateTokens`
(`tokenCounter.ts`): the core ≤ 3,000; each `mechanics` note ≤ 2,500; the
sheet filled with its defaults ≤ 1,000; titles unique across both packs and
the starter; every note title the core names exists; the renamed names
appear only in their new form; none of the Ironsworn sentences named in the
design's §5.8 appears (a list of short distinctive phrases); every table
note starts with "Roll 1d"; the meter sets pass `createMeterSet`.

### 9.5 Who writes it

The text is condensed from `rulebook.md` by the implementer with this
plan's decision table. **The core note is the author's to read before PR C
merges**: it is game design in the GM's voice, and the cheapest place to
catch a wrong rule.

## 10. Slice 9 — docs, with each PR

- **PR A:** `CLAUDE.md`'s GM tool list gains the four system tools (noting
  they are offered only to system stories) and tally challenges; the
  challenge bullet drops "best of X" as the only mode; the status report's
  §11.3 gets a dated update note.
- **PR A** also: `CLAUDE.md`'s directory map gains `app/misc/systems/`.
- **PR B:** the Designer section of `CLAUDE.md` notes built-in packs and
  `mergeImportedLore`.
- **PR C:** `CLAUDE.md` names Blood & Bone as the first default system;
  `pending_tests.md` gets §12's checks; the design's status says built.
- Every PR: a dated "Decisions made during implementation" section at the
  bottom of this file for any judgment call a slice had to make.

## 11. What could break, and what catches it

| risk | check |
|---|---|
| The M2 gate re-prompting after an `action_roll` | slice 3 test on `hasSatisfiedRollGate` |
| Stories without a system paying for four schemas | slice 5 test on the offered tool list |
| A first_to challenge broken by the schema change (`required_successes` no longer required) | slice 4 tests; the executor's error names the field |
| The Observer misreading a weak hit | `success` true on weak hits; the outcome check's existing tests plus one for `action_roll` |
| Prompt caching: the state message changing within a turn | the meters section is built at turn start like the timers section, so a turn's rounds share base messages; no layout change to the base messages |
| Compaction dropping meters | slice 5 test on `buildCondensedStorySeed` keeping them |
| Built-in note pushed to IndexedDB | slice 7 guard and test |
| `Date.now()` or random ids in render (the panel, built-in notes) | fixed timestamps, ids from data; code review |
| Gemini: the challenge tools still filtered out (§6.14) | known; recorded in `pending_tests.md` and the design's risks |
| The core over budget as rules are added | slice 8 budget test |
| The suite count moving | each PR states the count before and after and why |

## 12. What a cloud session cannot verify (goes to `pending_tests.md`)

- **The panel** (PR B): open a Blood & Bone story on the desktop app; the
  Lore page shows Stress, Beast, Exposure and XP bars for the character,
  Heat for the world, the vow's ten boxes, and during a skirmish the round
  and tally. A dimmed part of the Stress bar shows a lowered cap.
- **Built-ins** (PR B): the library shows *Blood & Bone* with its two packs
  and *The Hollow Hour*; Play starts it; Open a copy creates a local
  adventure that opens in the Designer; the picker lists the packs; pushing
  a built-in-linked note to the library is refused.
- **A played night** (PR C, on models the author picks — decision 76): play
  *The Hollow Hour* through session zero, one feeding, one Rule of 3 fight
  and one dawn. Stress rises once per trigger per scene, the fight takes
  three turns with the tally shown, dawn runs the Reckoning, and Beast moves
  only by the 1s rolled. Watch for refusals or softening of the feeding scene.
- **The dice tray**: with physical dice on, an `action_roll` throws one d6
  and two d10s in one toss.

## 13. Deliberately not built

- **Per-scene meter resets** (`resetsAtSceneEnd`): no caller yet.
- **Engine-counted Reckoning** (decision 80): `end_session` takes no dice
  option; the seam is its `reason`-only params.
- **Once-per-night ability uses in the engine** (decision 74): prose in the
  sheet until playtests say otherwise.
- **Fixing §6.14, §6.16, §6.17, §6.18** (decision 65): planned separately.
  Blood & Bone needs §6.14 for Gemini and §6.16 for the starter's secret to
  stay out of the narrator's sight.
- **A Designer AI tool for meter sets**: sets come from packs; a hand-made
  adventure's GM can still `create` meters one by one.
- **Showing built-ins in the notes tab and adventure lists**: §8.1.

## Decisions made during implementation

### 2026-10-22 - PR A (slices 1-5), `claude/default-systems-a`

Built on master after token savings T1-T3, image generation I1 and party
mode (baseline: 153 files, 2,413 tests; after: 162 files, 2,500 tests).
Approval is decision 108.

- **Live block, not the state message.** The meters and challenge sections
  are two optional fields on `LiveBlockInput` (`metersSection`,
  `challengeSection`), written after the timers. A test checks that a meter
  tick changes only the live-block message. Optional, so the existing
  `buildLiveBlock` test and any other caller compile unchanged.
- **Tool budget.** The four system tools add 1,204 estimated tokens to a
  system story (own bound in `tests/toolBudget.test.ts`, 1,500). The default
  list is 9,822 under its unchanged 10,000 bound: the wider
  `start_challenge` (mode, rounds) and `record_challenge_result` (three more
  outcomes) schemas are paid by every story, as the plan's §4.7 said.
- **`create_set` needs a resolved system.** Meter sets come from
  `resolveSystem().meterSets`, which is non-empty only when the lore holds a
  built-in system's notes. A hand-set `usesSystemTools: true` with no
  built-in notes can use `create`, not `create_set` (its error lists "none").
  Tests install a test system into the `BUILTIN_SYSTEMS` array.
- **`onlyUp` is stricter than the plan said.** `set` below the current value
  and `set_cap` below it are refused as well as a negative `adjust`, since
  either would make the meter fall.
- **A closed track is not markable.** `mark` and `progress_roll` on a track
  whose status is not `active` return an `[ERROR]`; `set_status` and the
  others still work. `progress_roll` never changes the status itself.
- **`start_challenge` errors name the missing field.** A `first_to` call
  without `required_successes`/`max_failures`, or a `tally` call without
  `rounds` 2-10, returns `success: false` with `[ERROR: ...]`. In tally mode
  `currentSuccesses`/`currentFailures` still count hits and misses (weak hits
  count for neither), so the same fields work for display.
- **A tally challenge refuses `success`/`failure`** with an error and leaves
  the challenge untouched; `first_to` accepts the hit/miss outcomes.
- **`STATE_CHANGE_TOOLS` keeps `"start_challenge"`.** The GM path still
  emits that name into the advisory leniency log (`generation.ts`), so only
  the duplicate handler and schema were removed. `parseChallengeRoundsValue`
  lost its last live caller with the duplicate; the import was dropped.
- **`manage_track` joins `KEEP_WHOLE_TOOLS`** with `action_roll`, since a
  progress roll is a roll with a verdict (decision 90).
- **Hidden meters.** A result for a `hidden` meter is stamped
  `hiddenFromPlayer`; the GM's own state section still lists it.
- **The Designer.** `AdventureDraft.systemState` carries only the hand
  switch. `draftToAdventure` does not carry `meters`/`progressTracks` (a
  draft has no field for them), so PR B must handle a built-in starter that
  has them when it is opened in the Designer (slice 7's "Open a copy").
  The Designer's built-in-systems paragraph is empty while the registry is,
  so its system prompt is byte-identical until PR C.
- **Tests.** Tally tests are a new file (`gmTools.tallyChallenge.test.ts`)
  rather than an extension of `challengeParity`; a shared
  `tests/helpers/systemsHarness.ts` holds the story and test-system helpers.
