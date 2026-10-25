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
- **The three plans' shared order:** campaign slice 1, then judge v2 slices
  1–3, then the GM prompts slices 2–5. GM prompts slice 1 can go any time.

Baseline: take it on master after those merges, with the full Vitest suite
and tsc.

**Ids.** Every new part's id is made with `crypto.randomUUID()` inside an
executor or a migration, never during render, with a prefix (`clk_`, `fac_`,
`frt_`, `sec_`, `clu_`, `loc_`, `end_`). Tests stub `crypto.randomUUID`.

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

## Checks every slice

- The full suite and tsc, against the baseline.
- The `engine-review` agent on slices 1–3.
- The standalone build on slice 2, which changes provider requests.
- Docs in the same change: `CLAUDE.md`'s campaign and session-zero sections,
  status report notes for §6.1, §6.2 and §6.16, and pending tests.

## Decisions made during implementation

(Filled in as the slices land.)
