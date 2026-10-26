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
