# The campaign format — implementation plan

**Design:** [`campaign-format-design.md`](campaign-format-design.md), approved
("All three", decision 241). Decisions 222–225, 230–232. Codex reviewed the
design (`research/codex-campaign-judges-review-2026-10-25.md`); this plan
follows the design's §14 contracts.

## Before slice 1

This plan builds on top of three things, which must be on master first:
- **Fantastic Realms** ([PR #252](https://github.com/SalokinGreen/your-story/pull/252)):
  `BuiltinSystem.tools` and `systemState.systemId`.
- **The held output**, decisions 220–221, 237 and 240 (`claude/judges-on-build`
  and its fixes branch): the hold the narration context plugs into.
- **The order across the three plans** is the graph below.

Baseline: take it on master after those merges, with the full Vitest suite
and tsc.

**Ids.** Every new part's id is made with `crypto.randomUUID()` inside an
executor or a migration, never during render, with a prefix (`clk_`, `fac_`,
`frt_`, `sec_`, `clu_`, `loc_`, `end_`). Tests stub `crypto.randomUUID`.

## The order across the three plans

This is the one dependency graph, kept here; the other two plans point at it.
An arrow means "must be on master first".

```
Fantastic Realms (#252) ──┐
Held output (220/221/237/240) ┤
                          ├─► G1 (truth fixes, gate messages; its FR test needs #252)
                          ├─► C1 (record, clocks, tool) ─► C2 (narration context) ─┬─► J3 (confirm + rewrite)
                          │                                                         ├─► G4 (narration prompt)
                          │                                                         └─► C3 (session zero) ─► G3 (session-zero block)
                          ├─► J1 (rung 1, re-ask) ─► J2 (combined call) ─► J3 ─► J4 (labelled set) ─┬─► G2 (roll + agency chains)
                          │                                                                           └─► G5 (length, tiers, dawn)
                          └─► C4 (Designer) ─► C5 (starters) ─► C6 (player view)
J5 (Settings) after J3.   C1 replaces G1's temporary front wording in the same change.
```

**Ownership of shared functions.** One slice at a time owns a function, and
the next slice that touches it rebases onto it and runs the full suite after
the merge:
- `generateStoryTurn` / `generateStoryTurnOnce`: C1 → J1 → C2 → J2 → J3 → G5.
- `buildSessionZeroBlock`, `setupGateMessage`, `executeConfirmSetup`: G1 → C3 → G3.
- The narration path and `rewriteFlaggedNarration`: C2 → J3 → G4.

**The cache rule across slices.** Every name that varies by story (the
resolved system's roll tool, the brief) renders in the live block. The system
prompt stays system-independent.

## Slice 1 — the record, clocks, the brief and the tool

**Shapes**, in a new `app/misc/campaign/types.ts`, re-exported from
`structs.ts`. `StoryData.campaign?: CampaignRecord` is optional, so there is
nothing to backfill in `ensureStoryDataArrays`:

```ts
interface CampaignRecord {
  version: 1;
  style?: CampaignStyle; // "sandbox" | "adventure_path" | "mystery" | "horror" | "episodic" | "slice_of_life" | "solo"
  pitch?: { premise: string; tone: string[] };
  safety?: { lines: SafetyItem[]; veils: SafetyItem[] }; // SafetyItem { id, text, keywords: string[] }
  factions: Faction[];       // { id, name, goal, methods?, clockId? }
  fronts: Front[];           // { id, name, dangers: {name, impulse}[], portents: Portent[], doom: string, stakes: string[], clockId?, status: "active"|"resolved"|"doomed" }
  clocks: Clock[];           // { id, name, segments, filled, triggers: ClockTrigger[], link?: {kind:"front"|"faction"|"thread", id}, onFill?: string, visible: boolean, paused: boolean, crossed: number[], migratedFromTimerId?: string, cancelled?: boolean }
  people: PersonExtra[];     // { npcId, want?, secret?, voice? } — joins StoryData.npcs by id
  secrets: Secret[];         // { id, title, truth, keyPhrases: string[], revealed: boolean, clues: Clue[] }; Clue { id, text, where?, found: boolean }
  locations: Location[];     // { id, name, features: string[], noteId?, npcIds: string[] }
  beats?: { list: Beat[]; currentId?: string; suspendedId?: string }; // adventure path only
  endStates: EndState[];     // { id, text }
}
type ClockTrigger = "miss" | "scene" | "rest" | "session" | "manual";
interface Portent { at: number; text: string }
```

**Pure logic**, in `app/misc/campaign/clocks.ts`. No I/O; tested alone.

| Function | Does |
|---|---|
| `tickClock(clock, by, reason)` | Returns `{clock, crossed: Portent[], filled: boolean}`. Clamps to `[0, segments]`, honours `paused`, and reports each portent once through `crossed` (design §14.2). |
| `defaultPortents(front, segments)` | Spreads portents evenly. |
| `ticksForEvents(record, events)` | Takes the turn's ordered `TurnEvent`s (`{kind: ClockTrigger, toolCallId}`) and returns the ticks once per trigger per clock per turn. A clock created this turn ignores earlier events. |

**The migration**, in `app/misc/campaign/migrate.ts`:
`migrateTimers(story): boolean`.
- **When.** It runs in `setupUIFromStory` beside `addMissingBuiltinNotes`. It
  is idempotent, keyed by `migratedFromTimerId`.
- **What it creates.** Each `CountdownTimer` becomes a manual clock. It keeps
  `totalTicks` as its segments, so it may be any size, with
  `filled = totalTicks - currentTicks`, the same status and visibility, and
  the timer's id.
- **The record.** It creates `story.campaign` with empty lists when the story
  has timers and no record.

**The engine ticks:**
- **Where events are gathered.** `executeGMTools` (`gmExecutor.ts`) collects
  the turn's events as tools succeed:
  - `miss` from an `action_roll` or `feat_roll` miss, a `progress_roll` miss,
    or a `record_challenge_result` failure;
  - `scene` from `increment_scene` (`toolExecutor.ts`, around line 1741);
  - `rest` from `take_rest`;
  - `session` from `end_session`.

  Refused calls produce no event.
- **When ticks are applied.** After each tool batch: apply `ticksForEvents`,
  and append one `[Clock …]` line per tick and per crossed portent to that
  batch's last result's `contextForStory`. The GM sees them in its next round,
  and the narration context's public summary carries them.
- **The director.** `selectDirectorMove` (`mythic.ts`, around 656) targets
  `campaign.clocks` first, then legacy timers.

**`manage_timer`.** It translates onto clocks when `story.campaign` exists
(the design §4 table), and keeps today's behaviour otherwise.

**The `campaign` tool**, a schema in `gmTools.ts`:
`{ action, part?, id?, data?, by?, reason? }`.
- **Actions:**
  - `read`;
  - `add`, `edit`;
  - `tick`, `pause`, `resume`;
  - `reveal_secret`, `place_clue`, `find_clue`;
  - `advance_front`;
  - `set_beat`, `open_side_beat`, `close_side_beat`.
- **Validation.**
  - Every `data` is validated per part by `validatePart(part, data)` in
    `app/misc/campaign/validate.ts`.
  - The rejection carries the exact repair: "faction needs `goal`", "clock
    `segments` must be 4, 6 or 8 for a new clock".
  - Unknown ids are rejected with the valid ids listed.
- **The executor** is `executeCampaign` in a new `app/misc/campaign/executor.ts`,
  dispatched from `gmExecutor.ts`. It works on the working copy.
- **The six places:** the schema, the whitelist (always offered, so the list is
  stable), the executor, `GOOGLE_ESSENTIAL_TOOLS`, the label "Campaign" and
  `KEEP_WHOLE_TOOLS` (only `read` results are stubbed).

**The brief**, `formatCampaignBrief(story, budgetTokens = 800)`, in
`app/misc/campaign/brief.ts`:
- built in the design §14.5 priority order;
- rendered in `buildLiveBlock` after the meters section, when `story.campaign`
  exists;
- with one "(+N …, read with campaign)" line for whatever does not fit.

**`storyProgress`.** `deriveStoryProgress(story)` in
`app/misc/campaign/progress.ts` follows design §14.6. `mythic.ts`'s progress
function calls it when a record exists and keeps the chapter-based value
otherwise.

**Tests** (new files, `tests/campaign.*.test.ts`):
- **clocks:** portents crossed once across an untick and refill; one tick per
  trigger per turn; paused; new this turn;
- **migration:** idempotent; remaining → filled; any capacity;
- **`manage_timer`:** the translation;
- **the executor:** each action, rejection texts, unknown ids;
- **the brief:** priority, the budget, safety always whole;
- **`storyProgress`:** per style, and chapters kept;
- **the director:** targets clocks;
- **the tool budget:** holds;
- **the six places:** holds;
- **old saves:** with no record, the GM prompt and behaviour are byte-identical
  to before (snapshot of `buildGMStagePrompt` output).

## Slice 2 — the narration context and secrets

**`buildNarrationContext(turn, story)`** lives in a new
`app/misc/campaign/narrationContext.ts` (design §14.1). It returns the message
list for the narration call and for rewrites:
- **The player's line.**
- **The GM's visible prose,** via `extractVisibleText` and
  `stripHiddenLoreContent` (`ai_staged.ts:78`, its first caller).
- **Each tool result's public summary,** from a new `publicSummary(result)`
  per tool type in `turnTimeline.ts`. It reuses `redactForPlayer`.
- **The tone, safety and `story_instructions` notes.**
- **The last turns' visible prose.**

**Where it replaces today's context:**
- In `generation.ts`, `buildStoryContinuationPrompt` stops continuing the GM
  conversation and uses this context. That is the separate-narration path.
- `rewriteFlaggedNarration` (`observer.ts:926`) takes this context instead of
  the GM conversation.

**Inline GM prose is unchanged:** when the GM's final round is the prose, it
is the prose.

**Tests:**
- a turn whose reasoning, tool arguments and a read note name a secret gives
  a narration request (captured through `mockGMFetch`) containing none of
  them;
- `story_instructions` reach the request;
- the rewrite request is built the same way.

## Slice 3 — session zero

- **`setupSteps.ts`.** It gains the table steps `style` and `tone_safety`
  (design §14.4). Quick mode requires `setting`, `tone` and `tone_safety`.
- **`getSetupProgress`** (`campaignPlan.ts`). Campaign readiness becomes:
  - a record with a style and at least one part beyond the pitch;
  - or a `gm_plan` note, for old stories.
- **The approval hash.** `currentSetupHashes` hashes the record's public
  projection and secrets, as a third hash.
- **Setup progress** counts a `campaign` write that changed the record hash.
- **`start_game`** refuses on the minimal requirements only. The style's
  missing parts come back as a warning line in the result.
- **The card.** `SetupConfirmModal.tsx` shows `publicCampaignView(record)` from
  `app/misc/campaign/publicView.ts`, which is the only projection used for any
  player view.
- **The session-zero block** gains the style's expected parts and the safety
  step's hint.
- **The safety check in session zero** is a deterministic keyword check of
  each line's `keywords`; judge v2 slice 1 builds it. It runs while the
  Observer is suspended.

**Tests:**
- the steps per mode;
- readiness, old and new;
- the hash changes;
- `start_game`'s refusals and warnings;
- the card's projection never contains `truth`, `doom`, hidden clocks or NPC
  secrets.

## Slice 4 — the Designer

- **`write_campaign`** in `designer_tools.ts`, the same parts as `add` and
  `edit`, validated by `validatePart`.
- **The conversions.** `draftToAdventure` and `adventureToDraft`
  (`designer_executor.ts`) carry `campaign`, with a round-trip test.
- **`summarizeDraft`** lists the record and the authoring warnings from
  `campaignWarnings(record)` in `validate.ts`: a mystery secret with fewer than
  three clues; a front without a clock; a style part missing.
- **`designer_ai.ts`:**
  - rewritten paragraphs on session zero and the campaign;
  - "notes are read by title" replaces "pulled in by keyword";
  - the starters as examples of each style.

## Slice 5 — the starters

Each starter's `storyTemplate.campaign` is filled in (design §9). Hollow Hour,
Grave Watcher and Last Resort are under `blood-and-bone/`; Wolfwillow is under
`fantastic-realms/`.

- Their "Running it" notes are trimmed of what the record now carries.
- `seedBuiltinNotesOffered` is unaffected.
- **Tests:** each record validates; the mystery has three clues per secret;
  each front has a clock.
- **The prose** is for the author to read in the PR.

## Slice 6 — the player's view

- **The Lore page** gains a "Campaign" panel (`app/story/CampaignPanel.tsx`,
  `ys-*` tokens) built from `publicCampaignView`:
  - pitch and tone;
  - lines and veils;
  - visible clocks;
  - "What we know", the found clues.
- **`buildPlayerView`** (`party/partyHost.ts`) adds the same projection.
  `tests/party.redaction.test.ts` extends to it.
- **Online guests:** the existing §6.12 leak (guests receive the whole
  `StoryData`) is unchanged and stays named as a gap.
- **The check:** a browser screenshot at phone width, and an APK after merge.

## Revised after Codex's review

Codex reviewed the three plans ([`research/codex-plans-review-2026-10-25.md`](research/codex-plans-review-2026-10-25.md)). Its findings for this plan
change the slices above as follows. Where this section and a slice disagree,
this section wins.

**Clock events come from typed results, not `success`** (finding 1). A graded
miss returns `success: false`.
- `turnEventsFrom(result)` reads the result's type and outcome:
  - `action_roll` with outcome `miss`;
  - `feat_roll` with outcome `miss`;
  - `manage_track` with `action: "progress_roll"` and outcome `miss`;
  - `record_challenge_result` with a failure;
  - `increment_scene` executed;
  - `take_rest` executed;
  - `end_session` executed.
- A result whose `contextForStory` starts with `[ERROR` is no event.

**`manage_timer`'s real actions** are `create`, `advance`, `toggle_pause`,
`cancel` and `trigger` (finding 2). On a story with a record:

| Action | Becomes |
|---|---|
| `create` | A manual clock, at any capacity |
| `advance` | A tick |
| `toggle_pause` | Toggles `paused` |
| `cancel` | Paused, with `cancelled: true` |
| `trigger` | Fills the clock at once and reports its fill |

Lookup is by clock id or name, as timers are found today. The results keep the
existing result types, so the timeline and the labels are unchanged.

**A turn event ledger** (finding 10). `GenerationTurnState.events: TurnEvent[]`
lives in `generation.ts` for the turn, and is passed into every
`executeGMTools` call. Each event carries `{kind, toolCallId, order}`, and a
clock carries `createdOrder`. Ticks apply at tool boundaries inside the batch,
in call order, so a `pause` before a `miss` in one batch is honoured. The
consumed `(clockId, trigger)` keys live on the ledger, and the turn's
one-tick-per-trigger rule reads them across rounds.

**The shapes the slice left open** (finding 11):
- **Beats.** A `Beat` is `{ id, title, summary, status: "pending"|"current"|"done"|"suspended" }`.
  - `set_beat` marks the current beat done and the given one current.
  - `open_side_beat` sets `suspendedId` to the current beat and makes the side
    beat current.
  - `close_side_beat` restores `suspendedId`.
- **Portents.** `tickClock(clock, by, reason, record)` takes the record and
  looks up the linked front's portents. A clock with no front has none.
- **Director moves.** `DirectorMove.targetTimerId` gains a sibling,
  `targetClockId`.
- **Visibility.** A clock's `visible` defaults from the style (decision 231)
  through `defaultClockVisibility(style)`.
- **Dangling references** render "(missing)" and are kept.
- **Migration.** It maps every timer status: `active` and `paused` to
  `paused: false` and `true`; `triggered` to full; `cancelled` to
  `cancelled: true`.

**Legacy precedence** (finding 15). A record created only by the timer
migration carries `origin: "migrated"`. On such a record:
- **Beat tools** keep the legacy plan-note behaviour until the record gains a
  style.
- **Readiness** follows the old plan note.

A test runs load → save → sync shape → reload on a story with timers and an
existing spine.

**The GM conversation is assembled in `generation.ts`, not in
`buildStoryContinuationPrompt`** (finding 4).
- **The prompt builder.** `buildStoryContinuationPrompt` stays the narration
  instruction text.
- **Slice 2 replaces the message assembly** around `generation.ts:3712` with
  `buildNarrationContext` and returns that context on `GenerationResult` as
  `narrationContext`.
- **Rewrites.** Every rewrite caller (`rewriteFlaggedNarration`'s callers in
  `generation.ts`) passes `result.narrationContext` instead of
  `gmStoryContext` and `narrationThoughts`.

**`confirm_setup` without a plan note** (finding 3). Slice 3 also changes:
- `executeConfirmSetup`'s plan refusal (`gmExecutor.ts:4077`), to accept a
  record;
- its `plan` payload (`:4082`), to `{ note?, campaign?: PublicCampaignView }`;
- the confirmation request type and the interaction handler;
- `SetupConfirmModal.tsx`.

A test approves a setup that has a record and no plan note, through to
`executeStartGame`.

**The six places** (finding 16), for `campaign`:
1. the schema in the `GM_TOOL_SCHEMAS` array, with a `CampaignParams` member of
   the params union and a `GMCampaignResult` member of the result union;
2. the whitelist;
3. the executor;
4. `GOOGLE_ESSENTIAL_TOOLS`;
5. the label;
6. **the Observer:** it is not a dice tool and produces no verdict; the
   six-places test records that explicitly.

`historyStubs.ts`: a new `stubPolicy(toolName, args)` keeps `campaign` results
whole except `action: "read"`, checked before the unconditional keep-whole
return.

**The Designer's dispatch** (finding 17). Slice 4 also adds `write_campaign`
to `executeDesignerTool` (`designer_executor.ts:197`), and deep-clones
`draft.campaign` on the working copy. A rejected write leaves the draft
byte-identical, tested.

**Tests that would actually catch the failures** (finding 19):
- an explicit six-places assertion for `campaign`;
- a campaign-bearing fixture in the token- and tool-budget tests;
- a multi-round clock test (a miss in round 1 and a miss in round 3 tick
  once);
- a secret canary: one unique string in a secret, the reasoning and a tool
  argument, asserted absent from the narration request, the rewrite request
  and the guest snapshot.

**Context cost** (finding 20). The token-budget test measures a story with a
full brief and whole thread descriptions, and the live block's growth is
reported in the PR.

## Checks every slice

- The full suite and tsc, against the baseline.
- The `engine-review` agent on slices 1–3.
- The standalone build on slice 2, which changes provider requests.
- Docs in the same change: `CLAUDE.md`'s campaign and session-zero sections,
  status report notes for §6.1, §6.2 and §6.16, and pending tests.

## Decisions made during implementation

### 2026-10-25 — slice 1 (`claude/campaign-c1`)

Where this entry and the plan above disagree, this entry is what was built.

- **The tool budget does not hold with the plan's schema, and the author
  should decide.** Measured with `estimateTokens` over the default list:
  9,899 tokens before; 10,385 with the schema as the plan sketched it (a
  486-token `campaign` with described properties and enums); 10,034 with a bare
  schema (135 tokens: the 13-action enum alone is about 50). A schema that fits
  the 101 tokens of headroom is not possible with 13 actions. What was built:
  the bare schema (no property descriptions, `part` and `data` untyped beyond
  `string` and `object`), the data shapes moved out of the schema into
  `PART_SHAPES` (`validate.ts`), which `read` on an empty part and a refused
  write return, and `tests/toolBudget.test.ts` holding the rest of the list to
  the old 10,000 plus a separate `CAMPAIGN_TOOL_EXTRA = 150` bound for the
  campaign tool, the way Manual Dice Mode and the system tools have their own
  bounds. The choice for the author is to accept that (default stories pay 135
  tokens a round), or trim 35 tokens from other tool descriptions, or offer
  `campaign` only to stories with a record (which breaks the stable list: a
  story would change its tools mid-play at its first `add`).
- **The ledger is not on the clock.** The plan put `createdOrder` on a clock;
  an order is only meaningful inside one turn, so a persisted value would
  suppress events on the next turn. `TurnLedger.clockCreatedAt` (clock id to
  the order that was next at its creation) is on the ledger instead.
  `executeGMTools` takes the ledger in `GMToolContext.turnLedger`, works on a
  copy, and returns the updated one as `GMExecutionResult.turnLedger`;
  `generation.ts` keeps it in a local beside the GM round loop, so an aborted
  batch commits nothing to it. (`GenerationTurnState` does not exist in the
  code, so there is no such type.)
- **Ticks apply after each tool, not each batch**, and the `[Clock … → …]` lines
  are appended to the triggering tool's own result (not the batch's last), with
  the structured reports on `GMToolResult.clockReports` for the narration
  context's public summary (slice 2), which must drop `visible: false` ones.
- **`tickClock`** returns `{clock, crossed, filled, applied, refused?, reason?}`
  (`applied` and `refused` added). A paused or cancelled clock is refused for a
  hand tick too, not only for triggers; the GM resumes it first. A hand tick
  needs `reason`.
- **Portents.** A portent with `at: 0` means "not set"; if any portent has no
  `at`, all are spread evenly (`effectivePortents`), so a portent never fires at
  fill zero. `crossed` stores the effective `at`.
- **Timers once a record exists.** The legacy `timers` array is kept and goes
  stale; clocks are the truth. Consequences, all gated on `story.campaign`:
  `formatTimersState` is skipped (the brief shows the clocks), `get_game_state`
  "timers" lists clocks, the director skips a timer the migration already
  turned into a clock, and `adjustTension` counts a clock one segment from full.
  `manage_timer create` on such a story makes only a clock; its visibility
  defaults from the style when `visibility` is not given.
- **`migrateTimers`** also runs when `campaign add` creates the first record
  (the executor calls it), but then the record has no `origin`. A migrated
  record loses `origin` when it gains a style (`campaign edit style`).
- **`storyProgress`** derives from the record only when the record has a style;
  a record the timer migration made (no style) keeps the chapter-based value.
- **`campaign` results are `hiddenFromPlayer`** (added to
  `HIDDEN_FROM_PLAYER_TOOL_NAMES`), since reads and secrets are the GM's. The
  player's own view is slice 6.
- **Action semantics the plan left open.** `advance_front` ticks the front's
  clock by `by`, or with `data: {status}` sets the front's status; a front with
  no clock says how to add one. `set_beat` is refused while a side beat is
  open. `open_side_beat` takes `data: {title, summary}` and creates the beat.
  Beats need the `adventure_path` style. A person is added by `npcId` (or
  `npc`, a name) and an unknown NPC lists the valid ids. `edit` of a secret
  cannot change `clues` or `revealed`. New clock sizes are 4, 6 or 8; an edit
  allows any whole number from 1 to 100, so a migrated clock stays editable.
- **Ids.** Short: `prefix_` plus the first 8 hex characters of
  `crypto.randomUUID()`, checked unique inside the record. Two prefixes the plan
  did not name: `bt_` for beats and `saf_` for lines and veils.
- **"People here" in the brief** is the people attached to a location whose name
  appears in the latest scene part (no current-location state exists). It is
  the last priority and is dropped first.
- **The no-record snapshot** (`tests/campaign.oldSaves.test.ts`) stores digests
  (length and SHA-256) of every message of `buildGMStagePrompt` for a fixture
  story with timers, taken from `claude/redesign-base` (`git archive` into a
  scratch copy sharing `node_modules`) before the change. Only the tool list
  differs, and the tool budget test holds that.
- **Not done in this slice.** The `engine-review` agent was not run (it is the
  caller's to launch). The GM prompt's "Fronts advance on their own" line was
  left alone, as briefed. Live brief size: a full brief grows the live block by
  771 tokens on the fixture (`tests/campaign.brief.test.ts`).

### 2026-10-25, the tool budget (decision 242, this session)

- The author chose to trim other tools rather than give `campaign` its own allowance. `manage_timer`'s description was cut (it also now says a timer is a clock once a campaign record exists) and its reserved, unread `auto_advance` parameter was removed from the schema (the executor still treats a missing value as false). `tests/toolBudget.test.ts` holds the whole default list, `campaign` included, under 10,000 (measured 9,977), and `CAMPAIGN_TOOL_EXTRA` is gone.


### 2026-10-25, engine-review fixes (`claude/redesign-1`)

- **Hidden clock lines are the GM's alone.** `applyTurnEvents` lines for a clock with `visible: false` go to a new `GMToolResult.gmOnlyContext`, appended only where the GM's tool message is built (`generation.ts`); `contextForStory` (the player's timeline, `part.gmToolCalls`, the narrator's context) keeps visible-clock lines only. `campaign` joined `HIDDEN_FROM_PLAYER_TOOLS` in `turnTimeline.ts`.
- **Front wording** in the system prompt and the CAMPAIGN PLAN live section now teaches `campaign` (a `front` part plus a clock), identical for every story. This moves the system prompt and the live block's plan section for a story with no record too, so two of `campaign.oldSaves.test.ts`'s BEFORE digests were retaken (the other thirteen are untouched); the test comment says so. The brief's Clocks heading says which triggers the engine ticks and that `[manual]` ones move only on a tick.
- **Stale `story.timers`** are not read once a record exists: `adjustTension` (`toolExecutor.ts`) and `selectFrame` (`primaMateria.ts`) read clocks only.
- **Filled clocks** have no line of their own in the brief: one last line, "Filled (cancel one to clear it): a, b", which the budget drops first. The turn a clock fills is told by its tick result. A full clock can now be cancelled by `manage_timer cancel` and by a new `campaign` action `cancel` (one enum word; the list stays under budget, `toolBudget.test.ts`). `resume` undoes it.
- **Gemini:** `filterToolsForGoogle` rewrites an object parameter with no properties (`campaign.data`) as a JSON string on a copy; `executeGMTools` parses a string `campaign.data` back before validation. The shared list is unchanged. A live Gemini check is in `pending_tests.md`.
- **Unfireable triggers:** the validator refuses `rest` (needs `take_rest`) and `session` (needs `end_session`) when `resolveSystem(story).tools` lacks the tool, naming the triggers that can fire. `miss` and `scene` always can (`record_challenge_result`, `increment_scene`).
- **`edit clock` refuses `filled`** (it bypassed `tickClock`), pointing at `tick`. The portent-key rekeying was skipped as asked.
- **Compaction seed:** the timers reset to none, so migrated clocks that are full or cancelled are dropped too; a migrated clock still running is carried with the rest of the record.

### 2026-10-25 — slice 4 (`claude/campaign-c4`)

- **One executor, two callers.** `write_campaign` does not duplicate the GM tool's rules: `applyDesignerCampaignWrite` (`app/misc/campaign/designer.ts`) runs `executeCampaign` on a deep clone of `draft.campaign` against a stand-in story built from the draft (its NPCs, notes and system state; no threads). So ids, clock-to-front linking, the 4/6/8 rule, the unfireable-trigger refusal (a draft with no system notes refuses `rest` and `session`, naming what can fire) and the "person must be an NPC" rule are the GM's. A refusal returns the original draft object, tested byte-identical.
- **`remove` added.** The plan says "the same parts as add and edit"; the other Designer tools have deletes, and the inspector needs one, so `write_campaign` also takes `action: "remove"` (`removeCampaignPart`), which clears the clock/front/faction links that pointed at the part and moves a removed current beat on. `data` also accepts a JSON string (the Gemini-safe form the GM tool uses).
- **`campaignWarnings` scope.** "Three clues" is asked only of the `mystery` style (the other styles may legitimately hold one-clue secrets); a front whose `clockId` points at a missing clock counts as having none.
- **Adventure Inspector.** A Campaign section (read-only summary, warnings banner, a remove button per part, no edit forms and no new dismissible surface). The author writes through the Designer.
- **Where adventures become stories.** `startAdventureLocally` spread the template already, but shared the object; it now `structuredClone`s `campaign`. The Restart row in `app/story/menu.tsx` spread the old story, so it kept advanced clocks and found clues: it now restores the adventure's copy, or, without a template, `resetCampaignPlayState` (clocks empty, clues unfound, fronts active, first beat current). Not touched: the legacy `timers` there, which Restart never reset.
- **Prompt.** `designer_ai.ts` gains a "Session zero and the campaign" section (session zero in one paragraph, each style and the parts it needs, each part, the warnings), says notes are read by title, and names the four starters as the worked examples. Their records are slice 5, so until it lands a copy opened from the Library has no record to show.
- **Not done.** No live model was run, so how well the Designer uses the tool is unmeasured. The Google tool filter strips the Designer's tools as before (§6.14). No UI screenshot: the Campaign section is unviewed in the browser.

### 2026-10-25 — slice 2 (`claude/campaign-c2`)

- **The narrator now sees much less, and the narration request changes for every story** (a story with no record too; `campaign.oldSaves.test.ts` checks the GM request and is unchanged). It gets the premise, the player's character name, the campaign's tone, lines and veils, `story_instructions` notes, the last turns' prose and the turn's public summaries, per the allowlist. It no longer sees the character sheet, NPCs, lore, memory or `scene.summary` (the summariser reads tool results, so it can carry a secret). Prose quality on the separate-narration path is unmeasured and no live model was run; adding the player's own sheet is a one-line change in `stableBlock` if it reads thin. Plan G4 (the narration prompt) is where this is tuned.
- **`publicSummary` is an allowlist by tool name** (`NARRATOR_VISIBLE_TOOLS`, `turnTimeline.ts`): dice, oracles, meters, tracks, challenges, combat, `npc_roll`/`npc_reaction`, `ask_question`/`ask_for_roll`. Everything else (notes, memory, `get_game_state`, `campaign`, `gm_roll`, note edits, timers, `add_npc`/`update_npc`, an unknown tool) yields nothing, except the visible `clockReports` lines the tool caused. Errors yield nothing (their text echoes the arguments). Timer tools are excluded wholesale, so a legacy timer that fires is not told to the narrator on the separate path; only the GM's own prose carries it. Revisit if that reads wrong.
- **Where the context is built.** Once per turn in `generateStoryTurnOnce`, either before the narration call or, for a turn the GM wrote inline, when the result is built. `GenerationResult.gmPromptMessages` is replaced by `narrationContext`; the dead `buildGMStagePrompt` calls in the retry and no-player-line branches were removed (their only output fed the old continuation). The context ends before the instruction: the story stage appends `buildStoryContinuationPrompt`, a rewrite appends its flagged block. On the separate path the narrator's own instruction and its prose are appended to `narrationContext` afterwards, so a rewrite sees the draft as the narrator's last turn, as before.
- **Reasoning.** The plan says rewrites drop `narrationThoughts`. The GM's reasoning is dropped (the old inline-path test that required it now asserts the opposite). The narrator's own reasoning on the separate path (`narrationOwnThoughts`) is kept for rewrites: the narrator only ever saw the allowlist, so it cannot hold a secret, and it tells a shortening pass what was deliberate. `narrationThoughts` still goes to the Observer's judges.
- **The pause rewrite** builds its context in the hook from `ctx.gmResults` (what has run so far), the same function.
- **`rewriteFlaggedNarration`**: `conversationMessages` renamed `narrationContext`; the standalone fallback (no context) is unchanged and no production caller reaches it now. The fallback's `gmStoryContext` is a full tool log, so a future caller should not use it without a context.
- **Cache.** The context marks the stable block `"prefix"` and the live block `"turn"`, which the `claude` CLI path uses to split its system file. `providerCall.ts` adds Claude `cache_control` only to tool-carrying requests (its own comment: the story stage cannot read the GM's entry), so the tool-less narration call gets no Claude cache marks; the `:narration` session id and the byte-identical stable block are what remain. Not changed: that is a decision for the cache rule, not this slice.
- **Not done / unverified.** No live model. `engine-review` is the caller's to launch. §6.16 and §6.22 are fixed for the separate narration call and rewrites only; the inline-prose path (the common one) is the secret-leak judge's (judge-layer v2), and the GM there still sees only the style notes' titles.
- **Follow-up (coordinator, same day).** The stable block now carries every enabled, non-hidden `character_sheet` note (all players' in couch and party), each cut at 12,000 characters, so the narrator keeps names, looks and voice; byte-stable while no sheet changes. The live block gains a roster of up to 15 living NPCs (name, role, description cut at 240 characters): `NPC.description` is what the NPCs page shows the player, `notes` (GM notes) is never read, and nothing from the campaign record's people. `gm_plan`, `dm_instructions`, secrets, memory and `scene.summary` stay out (canaries in the test). `publicSummary(result, { timerVisible })` now passes a firing timer or clock (`trigger_timer`, or `advance_timer` with `triggered`) when the story's clock or legacy timer by that name is visible; hidden ones, and any other timer result, stay out. This supersedes the "timer tools are excluded wholesale" note above. Merged origin/master (ee83a181) with no conflicts.
- **Engine-review fixes (slice 2).** (1) Roles alternate: `buildNarrationContext` is now [system, user(stable, "prefix"), assistant ack, user(live, "turn")], and the continuation prompt (story stage) or the flagged block (`rewriteFlaggedNarration`) is added INTO the last user message by `appendToLastUser`, never as a second user message; the separate path then ends [.., user, assistant(narration)] before a rewrite's user message. `tests/helpers/roles.ts` asserts alternation and no trailing assistant message for the narration request and the separate-path, inline-path and pause rewrites. (2) The allowlist gained `start_game` (whole result: the intro brief and the authored opening, decision 197), `confirm_setup` only when approved with `started: true`, `acknowledge_director_move`, `resolve_random_event` and `increment_scene`. (3) `publicSummary` scrubs the GM's own words: `[Reason: …]`/`[Context: …]` lines, a cancelled challenge's and an NPC roll's reason; stakes and planned consequences stay. `[X Error: …]` counts as an error; `success === false` does not (a miss reaches the outcome rewrite). (4) The "Compare … with `calculate`" lines and the "then call resolve_random_event(…)" tail are stripped by pattern (a new executor wording would need a new pattern). The choices stage still replays `part.raw` (status report 6.16 note says so).

### 2026-10-25 — slice 3 (`claude/campaign-c3`)

- **New steps and their modes.** `style` and `tone_safety` are table steps in the `world` group, ordered `setting`, `tone`, `style`, `tone_safety`, `campaign`. Quick mode requires `setting`, `tone` and `tone_safety` (as planned), so `style` is full-mode only; in quick mode the GM proposes the style and readiness still needs it on the record. Totals move: a solo Blood & Bone build is 17 steps (was 15), a couch of two 30 (was 28), a quick setup 3 (was 2). Existing tests that stood a story "at approved" in quick mode now list `tone_safety` as covered (`tests/helpers/setupCovered.ts`).
- **Readiness.** `campaignRecordReady(story)` (`campaignPlan.ts`): a record that is not `origin: "migrated"`, with a `style` and `hasPartBeyondPitch` (a faction, front, clock, person, secret, location, beat or end state; the pitch and safety lists do not count). Campaign is ready on that OR an enabled spine `gm_plan` note, so old stories behave as before. `hasCampaignPlan` (the setup reminder, and so `getSetupReminder`) uses the same test.
- **The third hash.** `currentSetupHashes` returns `campaignHash` only when the story has a real record (not a migrated-only one). `hashCampaignRecord` hashes the whole record (so a secret, a doom or a person's secret cancels the OK, not only the public projection) minus the play state the engine moves (`filled`, `crossed`, `found`, `revealed`, `paused`), so a clock tick in session zero never cancels an approval. A story with no record has the exact two-hash approval it had.
- **`start_game`.** Refuses on the minimal requirements only, plus one explicit check: `tone_safety` must have been asked when the mode requires it (it is the one creation step `start_game` names; the others are enforced through the card). The refusal text for a missing campaign names the `campaign` tool and that a plan note still counts. A success appends a "Prep warning" line (`styleWarningLine`, parts only, so the narrator's public summary of `start_game` carries no secret) and puts the authoring checks that quote a secret's title (`campaignWarnings`, minus "No style set") in `gmOnlyContext`; `confirm_setup` forwards it. `campaignWarnings` itself was not changed: the plan's "a style part missing" check lives in the new `campaign/styles.ts` (`missingStyleParts`, `STYLE_SPECS` from design section 5), not in the Designer's warning list, so slice 4's tests and Designer summary are untouched.
- **The card.** `SetupConfirmationRequest.plan` is now `{ note?, campaign? }` (`campaign` is `publicCampaignView(record)`, new `campaign/publicView.ts`). The projection is an explicit allowlist: style, premise, tone, lines and veils as text (no keywords), faction and front names, a front's stakes, locations with features, visible un-cancelled clocks, found clues. Beats, end states, people and secrets are left out entirely, not even counted. With both a plan note and a real record the card shows both. `SetupConfirmModal.tsx` renders a "Campaign: <style>" section with `ys-*` tokens only; it keeps its existing `useBackHandler`.
- **The block.** `buildSessionZeroBlock` gains `campaignSetupGuide`: the seven styles until one is chosen, then the style's expected parts with built and still-to-build, the triggers that suit it, the tool's parts, the lines-and-veils hint. About 500 tokens, session zero only, in the live block. The "NEXT: the campaign" text no longer tells the GM to write a `gm_plan` note; the gate's `campaign` message and the engine line (`setupEngineLine`) were reworded to match. **Not touched:** the system prompt's CAMPAIGN PLAN section still teaches the `gm_plan` note and says the spine is a prerequisite of `start_game`. That is gm-prompt plan G1/G3 territory and editing it would move the system-prompt digests in `campaign.oldSaves.test.ts` for every story; a note is in `pending_tests.md`.
- **The gate (`generation.ts`).** One edit, inside the session-zero progress check: a `campaign` result now counts like `create_note`/`edit_note` for the "did a hash change" test, and the comparison includes `campaignHash`. Nothing else in `generateStoryTurn`/`generateStoryTurnOnce` was touched.
- **The safety check in session zero.** Not enabled as a re-ask. Rung 1's line check already runs on the finished prose of every turn (it logs, session zero included). Its re-ask (rung 2, `!sessionZeroTurn`) stays off in session zero: setup is where the player's lines are named out loud, so a keyword check on the GM's own setup talk would flag the GM for confirming "no harm to children". The first play turn is checked by both. This is a judgment call; turning it on would be a one-line change in the re-ask guard, inside J2's function.
- **The strip.** `setupStrip.ts` and `SetupStrip.tsx` needed no change: they read `getSetupProgress`, so Campaign ticks for a record, and its `noteTitle` is undefined (not clickable) when there is no plan note. A Lore-page link to the campaign is slice 6.
- **`campaign_review`** (design section 8, "Starters only") is slice 5's, with the starters' records.
- **Party redaction.** `tests/party.redaction.test.ts` now carries a full campaign record with canaries in every field; no phone view contains any of them (nothing projects the record to a phone until slice 6).
- **Evidence.** Baseline 229 files, 3,782 tests; after 231 files, 3,815 tests (+2 files: `campaign.sessionZero`, `generation.campaignSetup`; +33 tests). `campaign.oldSaves.test.ts` digests did not move (the GM request of a story outside session zero is unchanged). tsc clean; `node scripts/build-standalone.mjs` succeeds. No live model, no browser screenshot of the new card section.

- **Engine-review fixes (slice 3).** (1) The campaign step's NEXT line again warns that a `gm_plan` note is shown in full on the card, so truths, secrets and endings go in the record or a `secret` note. (2) `campaignHash` is now present for any record whatever its origin, so a write to a migrated record before a style counts as setup progress; it still ignores play state. (3) The start_game "Prep warning" (style parts) moved from `contextForStory` to `gmOnlyContext` with the authoring checks, so the narrator's allowlist passes none of it. Each has a test (`campaign.sessionZero`, `generation.campaignSetup`). Merged origin/master 87ce3f13.

### 2026-10-25 — slice 5 (`claude/campaign-c5`)

- **Styles chosen** (design section 9): The Hollow Hour `mystery`, Grave Watcher `slice_of_life`, The Last Resort `sandbox`, Wolfwillow Crossing `adventure_path`. All four are `origin: "starter"` records built with `starterKit.ts` (fixed ids such as `clk_hh_hunter`, since a starter is built in memory and never stored) and written as data next to each starter (`hollowHourCampaign.ts`, `grave-watcher/campaign.ts`, `last-resort/campaign.ts`, `wolfwillow-crossing/campaign.ts`).
- **`campaign_review`** (design section 8, left to this slice by slice 3). `CampaignRecord.origin` gains `"starter"`. For such a story `getCreationSteps` replaces the `campaign` step with `campaign_review` (a table step, so it is required in full mode and not in quick mode, like `campaign`), and rewords the `style` and `tone_safety` hints as confirmations of what the record already says. The executor's style edit used to drop any `origin`; it now drops only `"migrated"`, so a player changing the style does not turn the review back into a build. `campaignSetupGuide` (session zero's block) says the campaign shipped built. `campaignRecordReady` needed no change (`"starter"` is not `"migrated"`), so a started copy is ready at once.
- **No `safety` part is shipped.** Lines and veils belong to the table, not the author: the `tone_safety` step still has to be asked, and the GM records them with `campaign` (`safety`). None of the four styles but horror expects the part.
- **Clock triggers follow what each system can fire.** Blood & Bone has no `take_rest`, so none of its clocks use `rest`; Fantastic Realms' barrow clock ticks on `rest` (a night by a fire with a full meal; eight rests make Lantern Week). The long fronts (the Tally, Tower Six, the Boarder, Heat) are `manual`, ticked by the GM as the calendar or the fiction reaches them; the paced ones use `session` (Grave Watcher's season clock, The Last Resort's bank deadline) or `scene`/`miss` (the hunter, the goblins). The pace of the `session` clocks is a guess, 8 played nights/sessions to a season, and unmeasured.
- **Secret fronts are hidden clocks, public ones visible** (decision 231 sets the default by style; the starters override where a spoiler would result: the barrow, the Tally, Tower Six, the Boarder, the buyer are hidden).
- **Wolfwillow gained seven NPCs** (`people.ts`; its template had none) because a campaign person must be an NPC. Their descriptions are what the player sees; wants and secrets are in the record only.
- **"Running it" notes trimmed** of the plan-writing instructions, and, for The Hollow Hour, of the situation and endings the record now carries (ranks, the Heat clock and the endings' mechanical weight stay). The long secret outline notes (Grave Watcher's and The Last Resort's seasons, Wolfwillow's week and after) are kept: they hold the beats of the two non-adventure-path styles (which have no beat part), XP guides and who-knows-what that the record cannot say.
- **Not done.** No live model, so how well the GM runs the review step is unmeasured. No browser screenshot of the setup card for a starter (the card's component is unchanged; the record's public view is covered by `campaign.starters.test.ts`). Evidence: baseline 234 files, 3,884 tests with 3 load timeouts (`imageGeneration.turn`, `providerCall.zai`, `themeTokensOnly`; taken after the new unimported files existed, before any wiring); after 235 files, 3,927 tests, all passing (+1 file, +43 tests, all in `campaign.starters.test.ts`). tsc clean; `node scripts/build-standalone.mjs` succeeds.
