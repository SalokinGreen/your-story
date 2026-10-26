# Real randomness for the GM — implementation plan

Status: **plan, for the author's review** (2026-10-26). It builds
[`randomness-design.md`](randomness-design.md) (decisions 259–262). Coding
starts only after the author's explicit yes. File and line references were
checked against master at 271ee949.

Five slices, one PR each, in this order. Each slice leaves master working and
shippable on its own.

| slice | what | depends on |
|---|---|---|
| R1 | table notes rolled in one call; the counts agree; Gemini's tools | — |
| R2 | names only from tables | R1's parser |
| R3 | the dice drawer | R2's name sources |
| R4 | tripwires | — (after R3 only to avoid conflicts in `generation.ts`) |
| R5 | the oracle step reworded; the eval runner and new cases | R1–R4 |

Every slice runs the suite and `tsc` against a baseline captured first, and
gets the `engine-review` agent before it merges. R1–R4 also get the standalone
build. Nothing here changes a screen except the Debug Logs, so no slice needs a
preview screenshot. R5's eval and the played session wait for the author's go.

---

## R1 — Table notes in one call

**Today:** `executeRollTable` (`gmExecutor.ts:3406`) rolls only the built-in
Mythic tables (`generateElement`, `mythic.ts:6314`). When it is given a table
note's title, it refuses and tells the GM to `read_notes` and `formula_roll`
instead (`findTableNote`, about `:3466`). So rolling a note is new behaviour,
not a fix.

### New: `app/misc/tableRoll.ts` (pure, no React, no storage)

```ts
export type TableDie =
  | { kind: "nd"; count: number; sides: number }   // 1d6, 1d20, 1d100, 2d6
  | { kind: "d66" };                                // two d6, first is the tens

export interface TableEntry { lo: number; hi: number; text: string }
export interface TableSpec {
  path: string[];          // ["Names"], or ["Larkenfell names"], or nested headings
  die: TableDie;
  entries: TableEntry[];
  instructions?: string;   // text inside the table that is not an entry: "roll again…", cross-references
}
export type ParsedTableNote =
  | { ok: true; tables: TableSpec[] }
  | { ok: false; reason: string };     // a layout outside the contract

export function parseTableNote(content: string): ParsedTableNote;
export function selectTable(parsed: TableSpec[], path?: string):
  | { ok: true; table: TableSpec }
  | { ok: false; candidates: string[] };   // zero matches, or several matches without a path
export function rollTable(table: TableSpec, rng?: () => number):
  { roll: number; dice: number[]; entry: TableEntry };
```

The parsing contract covers the layouts that `tests/helpers/tableShape.ts`
already checks:
- `## Heading (1dN)`, `## Heading (d66: roll ["1d6","1d6"], first die is the tens)`
  and `(…, on the Kind's list)`;
- `### ` nested headings;
- a lead-in `Roll 1dN:`, which `tableNotes.ts:41` writes for migrated tables;
- entries `N. text`, `a-b. text` (also with an en dash), and `NN text` for d66;
- an entry that runs over more than one line.

Anything else, such as bold question lists or multi-column rows, comes back
`ok: false`. `rng` defaults to `Math.random`, which is the seam the tests use.

`checkTableShape` keeps its own checks, but uses `parseTableNote` to find each
table. A new test, `tests/tableRoll.packs.test.ts`, parses every built-in table
note in `BUILTIN_SYSTEMS` (packs and starters) and rolls each sub-table 200
times. Every roll must land on an entry. Every note that is a table but can't be
machine-rolled is listed by title in that test, as an explicit allow-list,
starting with the creation-prompt notes.

### `roll_table` (schema in `gmTools.ts:1297`, `RollTableParams` at `gmTools.ts:216`)

- New optional parameter `table?: string`: a sub-table's heading, or a heading
  path written `"A > B"`.
- `table_name` still accepts a built-in Mythic table. It now also accepts a
  table note's title, found by the same loose title matching as `read_notes`.
- **The description gets shorter.** The prose list of 40 built-in names is
  replaced with "a built-in table (listed under Tables in your instructions)
  or the title of a table note". The 45 names move into the system prompt's
  Tables section (`ai_staged.ts:2438`), which is stable, so it still caches.
- The executor, in order:
  1. a built-in table name, as today;
  2. a table note, parsed with `parseTableNote` (`ok: false` returns a refusal
     that names the layout problem and says "read it and roll with
     `formula_roll`"), then `selectTable` (more than one candidate returns a
     refusal that lists them), then `rollTable`;
  3. neither: the closest titles, as today.

  The result type `GMRollTableResult` (`gmExecutor.ts:527`) gains `noteTitle?`,
  `tablePath?`, `roll?` and `instructions?`.
- **Visibility:**
  - When the note's `visibility` is anything but `always_reveal`, the result
    is marked `hiddenFromPlayer: true`. `publicSummary` (`turnTimeline.ts:218`)
    already returns null for those, so the narrator and the player's tool log
    never see the roll. The GM does.
  - A name-source table's result is hidden in the same way, and the name goes
    into R2's ledger (see R2).

### The counts agree

- One exported set, `ORACLE_USE_TOOL_NAMES` in `mythic.ts`, holds
  `fate_question`, `roll_table` and `roll_portent`. It replaces the two copies
  at `gmExecutor.ts:998` and `observer.ts:1886`, which `judges/combined.ts:206`
  also reads. Only a **successful** result counts, as `gmExecutor.ts:1686`
  already requires.
- `formula_roll` is not inferred as a table roll. The M2 gate
  (`reasoningTiers.ts:718`) is unchanged.

### Gemini

`roll_table`, `generate_name` and `resolve_random_event` are added to
`GOOGLE_ESSENTIAL_TOOLS` (`providerCall.ts:200`). `tests/gmTools.sixPlaces.test.ts`
gets a block asserting all three are there.

### The live block

`renderNoteTitleList` (`ai_staged.ts:1746`) prints each table note that
parses as its title plus its sub-tables and dice, for example
`FR — Names (Aurelane names d20, Larkenfell names d20, …)`. The output stays on
one line per note. A note that does not parse keeps its plain title.

### Conflicting instructions removed

- The Tables section's "read the note, roll the die with `formula_roll`" step
  becomes "`roll_table` with the note's title (and `table` for one of its
  sub-tables); read and roll yourself only when it says it can't".
- `fate_question`'s "Use it often; several a scene is normal" (`gmTools.ts:1256`)
  is removed.

### Tests

- `tests/tableRoll.test.ts`: the parser on each layout, the d66 range, an
  ambiguity refusal, a non-table refusal, and a seeded roll.
- `tests/tableRoll.packs.test.ts`.
- `roll_table` on a note: hidden when not `always_reveal`, counted for
  recency, and an error for a missing sub-table.
- `toolBudget.test.ts` must stay under both limits.

**What could break:** the tool budget (9,997 of 10,000; Fantastic Realms 11,465
of 11,500). The description is cut before anything is added, and the new
`table` parameter's text is about 25 tokens. Also `gmTools.sixPlaces` and any
test that snapshots `roll_table`'s description.

---

## R2 — Names only from tables

### New: `app/misc/names/`

- **`sources.ts`** resolves where names come from:

  ```ts
  export interface NameSource {
    kind: "person" | "place";
    noteId: string;                 // a built-in note id or a story note id
    compose: string[][];            // table paths rolled and joined with a space: [["First names"],["Family names"]]
    realm?: string;                 // Fantastic Realms: only when the story is in this realm
  }
  export function nameSourcesFor(story: StoryData, kind: "person" | "place"): NameSource[];
  ```

  The order is:
  1. the story's own table note whose title contains "Names" and whose
     `libraryNoteId` is not `builtin:`;
  2. `BuiltinSystem.nameSources` (a new optional field in `systems/types.ts`),
     taken from the story's system and, when it has one, its starter. The
     starter's own list goes first.
  3. the built-in fallback.

  The declared sources:
  - Blood & Bone: `builtin:blood-and-bone:oracles-people` → `[["Names"]]`.
  - Grave Watcher: its Names note, `[["First names"],["Family names"]]`.
  - Fantastic Realms: `builtin:fantastic-realms:table-names`, one source per
    realm sub-table with its `realm`. The current realm is
    `systemState.fantasticRealms.realm` (`structs.ts:713`). Only `take_rest`
    sets it today, so when it is unset every realm's list is pooled. Realms
    without a names sub-table (the R1 parse test lists them) use the pool.
  - Place names come from a source only where a pack has a place-name table.
    Otherwise they use the fallback.
- **`builtinLists.ts`** holds original lists, about 80 person names and 40 place
  names per style. The styles are `fantasy` (the default), `modern`,
  `historical-european` and `nordic`. All of this is new text (decision 3). A
  story's style is `StoryData.nameStyle?`, set from `generate_name`'s `style`
  parameter the first time it is passed.
- **`roll.ts`**: `rollNames(story, kind, count, rng?) → string[]`. It skips
  names already in the record, and never returns the same name twice in one
  call.
- **`accept.ts`**:

  ```ts
  export function isNameAccepted(name: string, story: StoryData, ctx: { notesCreatedThisTurn: string[] }): boolean;
  ```

  It is true when the name (case-insensitive, whole words) appears in any of:
  - the ledger, `StoryData.nameLedger?: string[]` (new; the last 30 offered;
    `pushOffered(story, names)`);
  - NPC names and campaign people and location names;
  - the text of any lore note that is not a `table` note and was not created
    this turn;
  - any player text: the user parts' text (couch, party and online lines
    arrive there as one batched string), the question answers stored in
    earlier parts' `gmConversation` tool results, and the enabled
    `character_sheet` notes, which presets and the player write.

  Old saves need no migration. Their names are already NPCs or are in the
  notes.

### Where it is enforced (`gmExecutor.ts`)

- `executeAddNPC` (about `:8080`), before the duplicate check.
- `executeUpdateNPC` (`:8161`), only when `params.name` changes the name
  (`:8207`).
- `campaign/executor.ts:396`: a `location` write that adds a location, or
  changes its `name`. This runs through the same `isNameAccepted`.

A refusal is `success: false`. It reads "That name wasn't rolled. Use one of:
A, B, C, or call `generate_name`." The three names are pushed to the ledger.

To know which notes the GM created this turn, `GMToolContext` (`:234`) gains
`notesCreatedThisTurn?: string[]`. It is carried across rounds by
`generation.ts` the way `turnLedger` is (`generation.ts:3217`, `:3788-3820`),
and appended to by `create_note`.

### `generate_name` (`gmTools.ts:1352`, executor `gmExecutor.ts:3501`)

- The schema becomes `kind?: "person" | "place"`, `style?` (the four styles)
  and `reason?`. `parts`, `starts_with`, `syllables` and `flavor` are dropped.
- It returns three names from `rollNames` and pushes them to the ledger.
- `generate_name` is removed from `NARRATOR_VISIBLE_TOOLS`
  (`turnTimeline.ts:103`). The candidates never reach the narrator; the name
  that is used reaches it through the roster and the prose.
- `nameGenerator.ts`'s pointer code is deleted, except for
  `collectUsedInitials`, if anything still reads it. The Naming section
  (`ai_staged.ts:2443`) is rewritten to "a new person or place takes a rolled
  name (the drawer, `generate_name`, or a name table); the engine refuses
  others".

### The prose flag (rung 1, flag-only)

- A new check, `unrolled_name`, is added to the `Rung1Check` union
  (`judges/types.ts:73`) and to `runRung1` (`judges/rung1.ts:298`). It runs
  over the final prose.
- It reports a capitalised one-to-three-word run that:
  - is not sentence-initial;
  - is not in a short list of common words and titles;
  - is not accepted by `isNameAccepted`.
- It is never verified and never re-asked: it is a Debug Logs line only.
  `FLAG_ONLY` is stated where rung-1 hits are acted on.

### Privacy

- `nameLedger` and `nameStyle` are stripped from the online snapshot by a new
  `withoutPrivateRandomness(story)` (`app/misc/judges/publicView.ts`), applied
  in `broadcastSnapshot` (`multiplayer/session.ts:449`) next to
  `withoutPrivateFindings`.
- `buildPlayerView` (`party/partyHost.ts:832`) already lists its fields
  explicitly. `tests/party.redaction.test.ts` gains an assertion that a ledger
  name never appears in a phone's view.

### Tests

- `names.sources`: Blood & Bone, Grave Watcher's composition, the Fantastic
  Realms realm and the pool, the story override, and the fallback.
- `names.accept`: player line, answer, sheet, an old save's NPC, a table
  entry *not* accepted, a same-turn note *not* accepted.
- The `add_npc` and `update_npc` refusals, and the `campaign` location refusal.
- The redaction tests above.
- `toolBudget`: `generate_name`'s schema shrinks, so it is net negative.

**What could break:** every test that calls `add_npc` with an invented name.
They get a seeded ledger through a test helper, `withRolledNames(story,
names)`. Designer-made adventures that start with NPCs are already in the
record, so they pass. Couch co-op names typed in the bubbles are user parts, so
they pass too.

---

## R3 — The dice drawer

### New: `app/misc/diceDrawer.ts`

```ts
export interface DiceDrawer { names: string[]; meaning: { action: string; description: string } }
export function drawDrawer(story: StoryData, rng?: () => number): DiceDrawer;   // rollNames(story,"person",3) + one meaning pair
export function formatDrawer(d: DiceDrawer | "preview"): string;
```

- The meaning pair comes from the Mythic meaning tables already in
  `mythic.ts`: the action table that `generateEventMeaning` uses, and the
  descriptor table. No new text.
- **One draw per turn:** `generateStoryTurnOnce` draws it once, next to
  `turnLedger` (`generation.ts:3217`). It is not drawn while
  `sessionZeroActive`, so the whole session-zero turn has none, including the
  one that calls `start_game`. The drawer's names are pushed to the working
  story's ledger at the draw.
- `buildGMStagePrompt` (`ai_staged.ts:1776`) gains the parameter
  `drawer?: DiceDrawer | "preview"`, and `LiveBlockInput` (`:1255`) gains
  `drawerSection?: string`, placed after the oracle line in `buildLiveBlock`
  (`:1697`).
  - The call at `generation.ts:3245`, the only one, which also serves the
    overflow rebuilds (`:3409`, `:3438`), passes the turn's drawer. It is the
    same object every round.
  - `ContextViewer.tsx:451` passes `"preview"`, which prints "(rolled when a
    turn starts)" and rolls nothing.
  - `judges/generationEval.ts:73` passes the fixture's own drawer (R5).
- The drawer is never part of `StoryData`, never in a tool result, and never in
  the narration context.

### Tests

- One draw per turn: two rounds and an overflow rebuild see byte-identical
  drawer text.
- No drawer in session zero, and none for the start-game turn.
- The preview never calls the RNG.
- The live block's token measure grows by at most 60 tokens.
  `tests/tokenBudget.test.ts`' shared-prefix measure is unchanged.
- A drawer name passes `add_npc` (the R2 check).

---

## R4 — Tripwires

### New: `app/misc/tripwires.ts`

```ts
export type Tripwire = "rest" | "session" | "travel" | "quiet_run";
export const TRAVEL_CHECK: SystemTurnEndCheck["trigger"];   // phrases + exceptions, read by textCrosses
export function tripwireOdds(chaos: number): number;        // 8,7,6,5,4 for chaos 1–2,3–4,5,6–7,8–9
export function evaluateTripwire(input: {
  story: StoryData; results: readonly GMToolResult[]; gmProse: string; playerLines: string[];
  eventsBefore: string[]; resolvedThisTurn: boolean; sessionZero: boolean;
}, rng?: () => number):
  | { rolled: false; why: string }
  | { rolled: true; tripwire: Tripwire; die: number; odds: number; hit: boolean };
```

- **The crossings,** first match wins, checked in this order: `session`
  (a successful `end_session`), `rest` (a successful `take_rest`; the same
  typed results `campaign/events.ts:23` reads), `travel` (`textCrosses`,
  `turnEndChecks.ts:89`, on `TRAVEL_CHECK` with the turn's player lines and
  final prose), then `quiet_run`.
  - `quiet_run`: the current turn minus the later of
    `agmtState.lastOracleTurn` and a new `agmtState.lastQuietRunRoll` is 6 or
    more.
  - The travel phrases require a completed crossing. They match past or
    arriving forms ("we ride to", "arrive at", "by evening", "hours later",
    "the next morning"). Their exceptions drop questions, "if/plan/will/let's",
    negations and "remember".
- **Skip rules:**
  - `sessionZero`;
  - a pending event exists;
  - an event was added this turn (an id in the after list that is not in
    `eventsBefore`);
  - an event was resolved this turn.
- **A hit** appends a `PendingRandomEvent` with `source: "tripwire"`. The
  union at `structs.ts:1137` gains that value, plus `tripwire?: Tripwire`. It is
  built like the scene-check event (`toolExecutor.ts:1836`): a focus, a meaning
  and a portent. The cap of 5 is unchanged, and nothing is trimmed, since the
  skip rule means none is pending.
- **Where it runs:** in `generation.ts`, after the turn's final round and the
  narration, next to the post-narration rung-1 pass, on the story that is
  about to be returned. It never adds a round. The event shows up in the next
  turn's live block through the existing `pendingEventsSection`
  (`ai_staged.ts:954`).
- Every roll and every skip that had a crossing writes one Debug Logs line:
  `Tripwire travel: d6=2 vs 1-in-6, no event`.
- Not run for the reword or precomputed-retry paths: the turn already had its
  chance.

### Tests

- `tripwireOdds` at every chaos value.
- Each crossing, with a seeded hit and miss.
- The four skip rules.
- The travel phrases on twenty lines (ten crossings, ten plans, questions and
  memories).
- Session zero and the start-game turn.
- An old save's five queued events are left alone.
- `source: "tripwire"` renders in the live block the same way as the others.

**What could break:** any code that switches on `PendingRandomEvent.source`.
Grep shows only display code. `ContextViewer.tsx:619` gets the third label.

---

## R5 — The oracle step and the eval

- **`gmPromptChains.ts` `rollDecisionChain()`, step 3:**
  - the clause "A person in the scene who knows the answer and would say it is
    not an oracle question: narrate what they say";
  - the example pair (innkeeper narrated; the undescribed cellar rolled).

  The system prompt stays identical for every story. The chain tests in
  `tests/gmPrompt.chains.test.ts` are updated.
- **The eval runner saves prose:** `judges/generationEval.ts` adds `prose`, the
  first 2,000 characters, to each run in the report, along with the tool calls.
  `scripts/eval-generation.mjs` writes it.
- **The fixture format** (`judges/evalFormat.ts`) adds an optional
  `drawer: DiceDrawer` to generation fixtures and a check
  `nameFrom: "drawer" | "rolled"`. The runner checks that an `add_npc` name is
  in the drawer or in a roll's result.
- **New cases in `evals/generation/`:**
  - `names-new-npc-uses-drawer`;
  - `table-undescribed-room-rolls-note`, which expects `roll_table` on the
    adventure's room table;
  - `tripwire-pending-event-resolved`, which expects `resolve_random_event`;
  - `drawer-quiet-turn-forces-nothing`, where the prose must contain no drawer
    name.
- **Docs:**
  - CLAUDE.md: the tools section (`roll_table`, `generate_name`), session zero
    (no drawer), and a new paragraph on the drawer and the tripwires.
  - `docs/pending_tests.md`: the eval rerun, and one played session that
    counts distinct names, tables rolled and surprises per hour.
  - The status report §6.14: Gemini's three tools.

**Waits on the author's go:** `eval-generation.mjs --go` on the new cases and
the old oracle cases, and the played session. Both spend the author's keys.

---

## Choices made in this plan (not in the design)

- **Name styles:** four (`fantasy`, `modern`, `historical-european`, `nordic`),
  about 80 person and 40 place names each, written fresh.
- **Fantastic Realms realm:** read from `systemState.fantasticRealms.realm`.
  When it is unset, every realm's names are pooled. No new realm-tracking is
  added.
- **The quiet-run counter** is a new `agmtState.lastQuietRunRoll`, so the
  oracle nudge's own counter is never faked.
- **`generate_name` loses its pointer parameters,** and `nameGenerator.ts`'s
  pointer code goes. The design's "three full names" makes them dead.

---

## Decisions made during implementation

### 2026-10-26, slice R1

- **`parseTableNote` returns `noteInstructions` as well as `tables`.** The
  plan's type had only `instructions` per table. A note's intro and its closing
  "Use when …" paragraph belong to the whole note, not to the last table, so
  they come back as `noteInstructions` and `roll_table` appends them after the
  table's own text (capped at 700 characters). `selectTable` takes the `tables`
  array, as the plan wrote it.
- **A per-Kind list is its children.** A `## X (1d6, on the Kind's list)` heading
  with `### Kind` blocks yields one table per Kind, path `["X", "Kind"]`, the die
  inherited from the parent and the parent's text copied to each as
  `instructions`. `selectTable` with `"X"` matches several and lists them, so
  the GM names the Kind. The live-block summary counts such a heading once
  ("Feature d6 by 7 sub-headings").
- **Entries must cover the die exactly** (`min…max`, no gap, no overlap; a d66
  needs all 36 keys), or the note is `ok: false` with the reason. The shipped
  packs all pass (`tests/tableRoll.packs.test.ts`); only the four miss tables
  and the eleven creation-prompt notes are on the allow-list, by title prefix.
- **A note wins over a built-in of the same name** (reverted from the first
  build's "a built-in name wins", after the engine review: the live block shows
  `FR — Names` as "Names", so the built-in could never be reached by a note's
  short name and `table` was dropped). `roll_table` rolls a note when the name
  matches one (exact title or the part after a built-in's " — "; for a name that
  is also a built-in, only those two tiers, so `city` is not taken over by
  "Places in the city"), and only falls back to the built-in when no note
  matches. A note-wins result says the built-in can be rolled with
  `table_name: "builtin:<name>"`, which skips the notes.
- **Review fixes (same day):** extra words in a heading's parenthesis
  (`(1d4, roll twice and combine)`) become the table's `instructions`; a refusal
  about a hidden note is `hiddenFromPlayer` and `closestTableTitles` leaves hidden
  notes out; `scrubGMText` strips the "[Around the table, for you to apply: …]"
  line so it never reaches the narrator.
- **Title matching** is its own small helper in `gmExecutor.ts` (`findTableNotes`),
  following `read_notes` (exact title, then the part after a built-in's " — ",
  then containment), because `read_notes`' matcher is local to its function. Several
  matches are refused and listed.
- **`checkTableShape`** keeps all its own checks and adds one: the engine must
  parse the note, finding as many top-level tables as the note has `##` headings.
- **The built-in table names in the system prompt** are generated from
  `MYTHIC_TABLE_NAMES` (45 names, one comma-separated line), so the list cannot
  drift from the code. The system prompt's digest in
  `tests/campaign.oldSaves.test.ts` was retaken by design; the other fourteen
  are untouched.
- **`resolve_random_event` had no label** in `gmToolLabels.ts`; added while
  asserting the six places for it.
- **Measured tool budgets** after the cut and the new `table` parameter: default
  list 9,889 tokens (was 9,997), Fantastic Realms 11,357 (was 11,465).

### 2026-10-26, slice R2

- **`NameSourceDecl`** (in `systems/types.ts`) names its note by `noteId` (the
  story's `libraryNoteId`) or by exact `noteTitle`, with an optional `setting`
  (a starter's source, listed before the system's) and `realm`. Grave Watcher's
  note has no library id (a starter note), so it is declared by title. A source
  whose note the story does not hold, or whose table path does not resolve in
  the note, is skipped, so Grave Watcher (which has no People table) falls
  through to its own note and a story that deleted a note falls through to the
  built-in lists.
- **A story-own Names note is read heuristically** (`composeFromNote`): with one
  "first/given" and one "family/surname" table the two are composed; otherwise
  each table not named like a place is a person source and each place-like one a
  place source. Grave Watcher's own note therefore matches rule 1 and its
  declaration is a backstop.
- **Tiers, not a pool across tiers.** `rollNames` uses the first tier that has a
  source (story's own, else declared, else the built-in lists) and draws a
  random source of that tier per name; a table that runs dry is topped up from
  the lists.
- **An explicit `style` asks for the built-in lists** in that style, even in a
  story with declared tables, and is remembered as `nameStyle` the first time.
  Without one, the story's `nameStyle` (else fantasy) only matters for the
  fallback.
- **Lists:** 80 given names, about 50 family names and 40 place names per style
  (a person is given plus family, so `generate_name` returns three full names).
  `OVERUSED_NAMES` (the names a model reaches for) is exported and a test holds
  that no list contains one.
- **Acceptance is a little looser than the plan's wording.** A rolled name with a
  title in front ("Captain Anka Dorn"), or shortened to a word of it, still
  counts as rolled; a candidate that is a word of an existing NPC or campaign
  place or group ("Hob" for "Old Hob") counts as in the record. Both are
  whole-word, case-insensitive and accent-safe.
- **The turn's player words** are `GMToolContext.nameTurn`
  (`notesCreatedThisTurn` and `playerTextThisTurn`), seeded by
  `generation.ts` with the player's line and filled by `executeGMTools` from new
  lore titles (any tool, so `merge_lore` and `duplicate_lore` count too) and
  from answered `ask_question` results. A note the GM only edits this turn is
  not tracked (the plan's loophole, left open).
- **Campaign locations** are checked through a new optional
  `CampaignWriteOptions.rejectName` on `executeCampaign`, passed only by the GM
  executor, so the Designer's writes and the starters are never refused.
- **`unrolled_name`** needs the story and the turn's name state, so
  `Rung1Turn` gained an optional `nameCheck`; only the final (post-narration)
  call passes it. The pre-narration re-ask path passes none, so the flag can
  never re-ask. It skips a run at the start of a sentence or quotation, ignores
  common words and titles, and one known word clears a whole run.
- **`nameGenerator.ts` and `tests/nameGenerator.test.ts` were deleted whole**
  (the pointer code, `collectUsedInitials` included: nothing else read it).
- **`resolve`-side fallout:** the B&B core still says "instead of ... calling
  generate_name"; it is a hashed built-in note and the sentence is harmless, so
  it was left alone.
- **Measured tool budgets** after R2: default list 9,711 tokens (was 9,889 after
  R1), Fantastic Realms 11,179 (was 11,357). The system prompt's digest in
  `tests/campaign.oldSaves.test.ts` was retaken again for the new Naming section.

### 2026-10-26, slice R2 review fixes

- **Established text is wide.** `isNameAccepted` also reads the premise, intro,
  scene summary, memory, goals, threads, the whole campaign record as JSON, and
  the GM's prose in parts before this turn (earlier-turn prose counts; the
  rung-1 flag is what caught an invention at the time). Names are compared
  whole-word, case-, accent- and apostrophe-insensitively (`normalizeForNames`).
- **Same-turn notes** are decided by `GMToolContext.turnStartLore`, the lore
  array captured in `generation.ts` before the first batch (batches replace the
  array and never edit it) and passed by reference; `notesCreatedThisTurn` and
  the executor's title tracking are gone. A note made, edited or renamed this
  turn proves nothing; a renamed note keeps its names (they are read from the
  start-of-turn copy). Without a context the executor uses the lore its batch
  started with. `Rung1Turn.nameCheck` carries the same `turnStartLore`.
- **Table rolls reach the ledger.** A `roll_table` on a note, and a built-in
  `names` roll, push the entry when it reads as a name (at most four words and
  forty characters, no sentence punctuation), so a rumour or hook entry does not
  push real names off the ledger. The plan's "characters" built-in does not
  exist; only `names` is a name table among the Mythic tables.
- **The setup card's change request is player text** (this turn's
  `playerTextThisTurn`, and later from the `confirm_setup` tool result).
  Only the later-turn reading is tested; the push in the executor is a four-line
  branch that needs a ready setup to run.
- **Containment both ways.** A wanted name that contains a ledger or record
  name, or is contained in one, is accepted ("Captain Anka Dorn", "Hob" for
  "Old Hob").
- **Role labels.** A name made only of words in `names/roleWords.ts` (about 400
  newly written roles, descriptors and function words) is accepted unrolled:
  "Innkeeper", "Hooded Stranger", "The Old Guard". A proper name still has to be
  rolled. The prose flag ignores those words too, so "old Brannoch Voss" is
  still flagged. Cost: a surname that is also a trade (Baker, Smith) passes.
- **Real places.** `BuiltinSystem.realWorldPlaces` (Blood & Bone) turns the
  campaign location and faction check off, because the GM names real streets and
  stations; people are still checked. `BuiltinSystem.defaultNameStyle` ("modern"
  for Blood & Bone) picks the fallback list when the story has no `nameStyle`.
  Campaign `faction` writes now go through the same hook as locations (a place
  list is used for the offered names).
- **No lookbehind** anywhere in the name code; the prefix is a capture group.
  `tests/names.test.ts` scans `app/misc/names/` and `judges/rung1.ts`.
- **`rollNames` never comes up short:** the ledger's names are allowed back,
  then two list words are combined (a family name and a place suffix for a
  place), then a number is appended. The unrolled-name check builds its texts
  once per check (`createNameChecker`). `unrolled_name` is in
  `RUNG1_CHECKS` (`judges/evalFormat.ts`).

### 2026-10-26, slice R3

- **The meaning pair** is `drawMeaningPair(rng)` in `mythic.ts`: the `EVENT_ACTIONS`
  table (what `generateEventMeaning` uses) and `MEANING_TABLE_DESCRIPTOR_1`, both
  already there; no new text. The tables were not exported, so the helper lives
  beside them.
- **The drawer is `drawDrawer(story, rng)`** with `rollNames(story, "person", 3, { rng })`
  (R2's options-object signature). `generateStoryTurnOnce` draws once after the
  `turnStartLore` capture, only when `sessionZeroTurn` is false (the flag read
  before `start_game` flips it, so the start-game turn has none), and pushes the
  three names with `pushOffered` onto the working story at the draw. A tier or
  Observer retry runs `generateStoryTurnOnce` again and draws a fresh drawer; the
  discarded attempt's names stay on the ledger (harmless: they are still
  accepted, and `rollNames` avoids them).
- **Other callers:** `buildGMStagePrompt` has three callers (generation, the
  context viewer, the generation eval). The reword and precomputed-retry paths do
  not rebuild the GM prompt, so they need no drawer. The live block is not sent to
  party phones or online guests (`buildPlayerView`, the snapshot).
- **The context viewer** shows the preview line, but not in session zero.
- **Test limit:** the mock fetch cannot script a context-overflow error, so the
  overflow rebuild is covered by two `buildGMStagePrompt` calls with one drawer
  object being byte-identical, and the multi-round case by a recorded two-round turn.

### 2026-10-26, slice R4

- **Where it runs:** `generateStoryTurnOnce`, just before the final tier is
  resolved (after the post-narration rung-1 pass), on `storyData`, which the
  executor already merges in place; so the event persists like any other state
  change. A function-level `tripwireOff` is set from `sessionZeroActive` as the
  attempt starts (before `start_game` flips it) and by any repetitive round.
  The pending ids are captured at the same point (`eventsBefore`).
- **Skipped crossings are logged** (`Tripwire rest: skipped (an event is
  pending)`); a turn with no crossing and session zero write nothing.
  `evaluateTripwire`'s skip result carries an optional `tripwire` for that line.
- **Die:** `dN` for odds 1-in-N, a hit on 1 (the log reads `d6=2 vs 1-in-6`).
  A story with no `agmtState` is skipped.
- **Quiet run:** the turn index is `currentTurnIndex` (scene part count), a
  never-consulted oracle counts from 0, and `applyTripwireRoll` stamps
  `lastQuietRunRoll` on any quiet-run roll, hit or miss.
- **Travel exceptions** are whole-sentence: a question mark, a condition or
  plan word (if, will, plan, let's, should, need to, would, could...), a
  negation (not, never, no, don't...), or a memory word (remember, used to,
  once) anywhere in the sentence drops a crossing in it. Over-suppression is
  the cautious side; "no one noticed ... by evening" is dropped.
- **Display:** the live block marks a tripwire event "(a surprise the dice
  raised)"; the Context Viewer adds "(tripwire: travel)". No code switched on
  `.source`. Party phones never receive `pendingRandomEvents` (grep of
  `app/misc/party` finds none); online guests still get it whole (§6.12).
- **Not done:** `tests/campaign.oldSaves.test.ts`-style digests are
  untouched (no system prompt change).

### 2026-10-26, slice R4 engine-review fixes

- **Travel is no longer `textCrosses` on a phrase table.** `TRAVEL_CHECK` is
  gone; `travelCrossing(gmProse, playerLines)` strips quoted text (straight and
  curly; an unclosed quote runs to its line's end), drops any sentence with a
  question mark, speech or recap marker, plan, condition or negation, then
  accepts only (a) a journey verb (travel, journey, ride, sail, fly, drive,
  trek, hike, take the train/bus/ferry/boat...) with a preposition and a
  destination that is a settlement word or a capitalised proper noun, (b) "set
  out/off for", "leave for", "head out for", "make for" the same way, (c) "spend
  the week on the road", (d) a time skip that opens the sentence ("The next
  morning", "By nightfall", "Hours later"). "Walk", "head" and "march" are no
  longer journey verbs, and "the inn" or "the bar" is not a destination: the
  cautious side.
- **Player turns, not parts.** `playerTurnsSince(story, partIndex)` counts user
  parts after an index. `lastOracleTurn`, `lastQuietRunRoll` and the new
  `lastTripwireRoll` all stay in scene-part-index units (the unit the oracle
  already used) and are read through that count. `QUIET_RUN_TURNS` = 6 player
  turns. Assumes the turn's own user part is already in `scene.parts` when the
  tripwire runs.
- **Base.** With neither `lastOracleTurn` nor `lastQuietRunRoll` set, the first
  look stamps `lastQuietRunRoll` and counts nothing; session zero (the
  start-game turn included) stamps it every turn. `evaluateTripwire` now writes
  those two stamps (it was pure before).
- **One roll per three player turns** (`TRIPWIRE_MIN_GAP`), any kind, logged as a
  skip.
- **Drawer names are not ledger names.** `StoryData.recentDrawerNames` (last 9,
  `pushDrawerNames`) is accepted by the name check but `rollNames` does not
  avoid it; stripped from guest snapshots with the ledger. A test narrows a
  Fantastic Realms story to one realm and rolls after ten drawers.
