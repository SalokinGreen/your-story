# Token savings — implementation plan

**Status:** written 2026-10-22; **approved the same day (decision 107)**:
"Approved. Also pull from origin and do the token saving + default system
plans." Building has started: T1 and T2 are merged, T3 (slices 8-9) is built. It implements
[`token-savings-design.md`](token-savings-design.md), approved by decision
106; decisions 90–106 are in [`decisions.md`](decisions.md). It goes before
default systems' PR A (decision 97).

**Baseline when written** (commit `f1ff233`, master `13a70fe` merged in):
`npx vitest run` — 126 files, **1,888 tests**, all passing. Each slice
captures its own baseline (suite and `npx tsc --noEmit`) before its first
edit, as the `verify` skill says.

**Who builds it.** Each slice is specified work for the `implementer` agent
(Sonnet) or a fresh session on `claude-sonnet-5-5`, one slice at a time; the
planning session keeps the baselines and reviews each diff. Every slice in
`app/misc/` gets the `engine-review` agent before its PR merges. Slices that
change what is sent to a provider (5, 6) also get the standalone build
(`node scripts/build-standalone.mjs`).

## 1. Slices at a glance

| # | slice | touches | PR |
|---|---|---|---|
| 1 | The measurement harness | new `tests/helpers/turnHarness.ts`, `tests/tokenBudget.test.ts` | T1 |
| 2 | History stubs, old thinking dropped (decisions 90, 99, 103) | new `app/misc/historyStubs.ts`, `ai_staged.ts` | T1 |
| 3 | Fixed history start and the real-size trigger (decisions 94, 101; fixes §6.20) | `compaction.ts`, `ai_staged.ts`, `generation.ts` | T1 |
| 4 | Summary sections, summary instructions, "Compact now" (decisions 95, 102, 103) | `compaction.ts`, `storyCompaction.ts`, `structs.ts`, the note-type lists, `CompactStoryModal.tsx` | T1 |
| 5 | The stable prefix (decisions 91, 100) | `ai_staged.ts`, `generation.ts`, `providerCall.ts` (`ChatMessage`), `claudeCli.ts` | T2 |
| 6 | Provider caching and reasoning replay (design §4.6–4.7) | `providerCall.ts`, `generation.ts`, `sideModelCall.ts` | T2 |
| 7 | Cached tokens in the cost ledger (decision 104's measurement) | `providerCall.ts`, `generation.ts`, `turnCost.ts`, `ai_prices.ts`, `TurnCostPanel.tsx` | T2 |
| 8 | One trimmed tool list (decision 92) | `gmTools.ts`, `toolSchemas.ts` | T3 |
| 9 | Always-loaded note limits (decision 96) | new `app/misc/contextLimits.ts`, `ai_staged.ts`, `AdventureInspector.tsx`, `LoreEditor.tsx`, `designer_executor.ts` | T3 |
| 10 | Docs | with each PR | — |

**Slice 1 is first** because every later slice is checked against it: it
turns the measurements behind the design's §2 into a test, so each slice's
effect is a number in the suite, not a claim. Slice 2 comes before 3 because
the new trigger counts history as it is rendered, stubs included. Slice 5
needs 2–4 (it places the summary and history), and 6 needs 5's cache marks.
7 needs 6's usage fields. 8 and 9 are independent of the rest.

**Three PRs**, each merged only on the author's word (decision 5): **T1**
history and summaries (1–4), **T2** the layout, providers and the ledger
(5–7), **T3** the tool list and note limits (8–9). Default systems' PR A
starts after T2, on the new layout.

## 2. Slice 1 — the measurement harness

The design's numbers came from a scratch harness that drove the real
`generateStoryTurn` against a recording `global.fetch`; it is not in the
repo. This slice writes it properly:

```ts
// tests/helpers/turnHarness.ts
export interface FixtureOptions {
  priorTurns: number; // 16 in the design
  readEveryNthTurn: number | null; // null = prose-only history
  noteTokens: number; // 2,000 per on-demand note
  pinned: { dmInstructions: number; characterSheet: number; plan: number }; // tokens
  memories: number;
  npcs: number;
}
export function buildFixtureStory(o: FixtureOptions): StoryData; // deterministic: seeded text, no Math.random/Date.now
export interface RecordedRequest { url: string; body: any; tokens: number }
export async function runRecordedTurn(storyData: StoryData, opts: {
  rounds: { toolCalls?: { name: string; args: object }[]; content?: string }[];
}): Promise<RecordedRequest[]>; // stubs global.fetch with scripted provider replies, records each request
export function sharedPrefixTokens(a: any[], b: any[]): number; // tokens of the leading messages two requests share byte for byte
```

`tests/tokenBudget.test.ts` records today's facts as the baseline the later
slices change: per-round input for the 4-round fixture turn, the
history-to-window ratio with reads every fourth turn and every turn, and
`sharedPrefixTokens` between two consecutive turns (0 today). Each later
slice tightens one of these assertions in the same PR.

## 3. Slice 2 — history stubs and old thinking (decisions 90, 99, 103)

### 3.1 New `app/misc/historyStubs.ts` (pure)

```ts
export const STUB_RESULT_THRESHOLD_TOKENS = 150; // decision 103, tuned in playtests

/** A past turn's tool result as it is replayed: itself if short, else a one-line stub. */
export function stubToolResult(toolName: string, args: Record<string, unknown> | undefined,
  content: string): string;
// read_notes: [read_notes "B&B — Vampire": 2,029 tokens, cleared from history. Read it again if you need it.]
// anything else long: [search_memory: 412-token result cleared from history.]

/** A past tool call's arguments with long string values replaced, still valid JSON. */
export function stubToolCallArguments(argumentsJson: string): string;
// {"title":"Character: Mira","content":"[2,010 tokens, saved]"}

/** A past assistant message's content without its <thinking> (decision 99). */
export function stripThinkingForHistory(content: string): string; // via turnTimeline.extractVisibleText

/** The messages one past story part replays as: stubbed, thinking dropped. Deterministic. */
export function renderHistoryPart(part: ScenePart, index: number): ChatMessage[];

/** Tokens of renderHistoryPart(part), for budgeting (stubs, not raw results). */
export function estimateRenderedPartTokens(part: ScenePart, index: number): number;
```

### 3.2 `app/misc/ai_staged.ts`

- The history loop in `buildGMStagePrompt` (~lines 1922–2178: the
  `gmConversation` branch and the legacy `gmThinking` branch) moves into
  `renderHistoryPart`, which applies the stubs and drops `<thinking>`.
  Behaviour kept: the last assistant part keeps its `reasoning` and
  `reasoning_details`; older tool-call rounds keep plain `reasoning`, because
  DeepSeek's thinking mode rejects an assistant tool call without its
  `reasoning_content` from any turn (comment at ~line 2006, and
  `providerCall.ts` ~line 727). Which providers actually receive old
  reasoning is decided in slice 6.
- `getPartsWithinTokenBudget` (~line 208) counts `estimateRenderedPartTokens`
  instead of prose plus flat per-call amounts, so the window budgets what is
  sent.
- The full `gmConversation` stays stored on each part (the summary reads it
  in slice 4; the debug views show it).

### 3.3 Tests

`tests/historyStubs.test.ts`: the same part renders to identical messages
twice; results at or under 150 tokens stay verbatim; a 2k `read_notes` result
becomes the stub with its title and size; `edit_note` arguments stay valid
JSON with the body replaced; `<thinking>` is dropped and the prose stays; a
dice result is kept. `tokenBudget.test.ts`: the history-to-window ratio falls
from 3.5× and 11× to about 1×.

## 4. Slice 3 — fixed history start and the real-size trigger (decisions 94, 101)

### 4.1 `app/misc/compaction.ts`

```ts
export const FOLD_TARGET_RATIO = 0.5; // decision 101

/** Rendered tokens of every part after the summary (what the GM is sent). */
export function measureHistoryTokens(storyData: StoryData): number;

/**
 * New semantics: null while measureHistoryTokens <= historyBudget. Past it, the
 * cutoff is the earliest index that leaves the remaining parts at or under
 * historyBudget * FOLD_TARGET_RATIO, snapped FORWARD to a scene boundary within
 * SCENE_BOUNDARY_SNAP_WINDOW as today.
 */
export function planCompaction(storyData: StoryData, historyBudget: number): CompactionPlan | null;
```

`MIN_UNCOVERED_TOKENS_TO_SUMMARIZE` goes: a fold is always at least half the
budget. `ensureStoryCompacted` keeps its signature.

### 4.2 `app/misc/ai_staged.ts`

```ts
/** History = every part after scene.summarizedThroughIndex (a fixed start). If
 *  that is over budget (a summary failed this turn), fall back to today's
 *  sliding window over the rendered sizes, for this turn only. */
export function getHistoryParts(storyData: StoryData, historyBudget: number):
  { parts: ScenePart[]; startIndex: number; slidingFallback: boolean };
```

It replaces the `getPartsWithinTokenBudget(storyData.scene.parts, …)` call at
~line 1085. `startIndex` feeds `renderHistoryPart`'s index. The
`buildInfoMessage` call (~line 904, used by choices) keeps its sliding
window: it is a narration-model prompt with its own small budget.

### 4.3 `app/misc/generation.ts`

The compaction call (~lines 2114–2161) is unchanged in place and timing. On
failure it now logs `slidingFallback: true` for the turn, so the Debug Logs
show when history ran on the fallback.

### 4.4 Tests

`tests/compaction.trigger.test.ts`: no plan under budget; past budget, the
remaining history lands at or under half; the snap only moves forward; the
history start equals `summarizedThroughIndex` after `applyCompaction`; a part
can no longer sit between the window and the summary (the §6.20 case: 1,400
tokens just past the window used to be in neither); the fallback engages when
the history is over budget and no summary ran.

## 5. Slice 4 — summaries, instructions, "Compact now" (decisions 95, 102, 103)

### 5.1 `app/misc/compaction.ts`

```ts
export const SUMMARY_TARGET_TOKENS = 2000; // decision 103 (was MAX_SUMMARY_TOKENS 1500)
export const SUMMARY_SECTIONS = [
  "Where things stand now",
  "What the player is pursuing",
  "Open threads, clocks and pressures",
  "People",
  "Places and things",
  "Promises, debts and secrets revealed",
  "What the GM has established from notes and rolls",
] as const;

/** Prose plus the turn's full tool calls and results (decision 95). */
function partToCompactionText(part: ScenePart): string; // replaces partToText for the summary input

/** Every enabled summary_instructions note, joined; undefined if none. */
export function getSummaryInstructions(storyData: StoryData): string | undefined;

export interface CompactionOptions { focus?: string } // "Compact now"
export async function runCompactionPlan(storyData: StoryData, plan: CompactionPlan,
  apiOptions: CompactionApiOptions, options?: CompactionOptions): Promise<CompactionResult>;
```

`buildCompactionPrompt` asks for the sections as headings, the whole summary
rewritten each time, about `SUMMARY_TARGET_TOKENS`, then appends the
adventure's instructions and the focus when given. `callSummarizeApi`'s
`maxTokens` follows the new target. The validation and its one revision call
stay as they are.

### 5.2 The note type

`LoreType` gains `"summary_instructions"`: read only by the summariser.
Every list of note types gains it: `lore.tsx` (`TYPE_CONFIG` and both
`<select>`s), `LibraryPickerModal.tsx`, `NotesLibraryTab.tsx`,
`noteMentions.ts`, `nameGenerator.ts`, `designer_executor.ts`,
`designer_tools.ts` (with a one-line description) and
`AdventureInspector.tsx`. `buildGMStagePrompt`'s `categorizeNotes` (~line
1127) and `buildInfoMessage` skip it, so neither the GM nor the narrator sees
it.

### 5.3 "Compact now"

`storyCompaction.ts` `summarizeOldNarrative` gains `options?: { focus?:
string; keepRecentParts?: number }`; "Compact now" passes `keepRecentParts:
4` (two turns, decision 102). `app/story/menu/CompactStoryModal.tsx` gains a
*Summarise now* action with an optional focus field, separate from today's
checkbox flow.

### 5.4 Tests

`tests/compaction.summary.test.ts`: the prompt names every section, carries
the instructions note and the focus when given and not otherwise, and its
input includes a tool result from a folded part. `summary_instructions` notes
are absent from the GM's lists. "Compact now" keeps the last four parts.

## 6. Slice 5 — the stable prefix (decisions 91, 100)

### 6.1 The message order

`buildGMStagePrompt` returns, in order:

1. **system**: the system prompt with nothing per-turn in it. Out of it, into
   the live block: `freshStorySetupBlock`, `sessionZeroStartGameReminder`,
   `setupOverdueBlock`, the four note blocks (`observerNoteBlock`,
   `storyProgressNoteBlock`, `repetitionNoteBlock`, `knowledgeNoteBlock`),
   `pacingFeedbackLine` and `gmAdviceSection`. `lengthGuidance` stays: it
   changes only with the player's Reply Length setting.
2. **user, the stable block**: the player section, the archetype section,
   the DM instructions, then "STORY SO FAR"; followed by today's short
   assistant acknowledgement.
3. **history** (slices 2–3). Its last message carries `cacheBreakpoint:
   "prefix"`; with no history, the acknowledgement does.
4. **user, the live block and the action in one message** (no consecutive
   user messages, which some providers reject): the character sheets
   (decision 100), the campaign plan, the note-title lists, the memory
   section, the NPC summary, goals, threads, the oracle line, combat,
   timers, pending events and director moves, the per-turn system pieces
   above; then today's action text and turn instructions. It carries
   `cacheBreakpoint: "turn"`.
5. The prefill, as today.

**Planning refinement:** the campaign plan and the note-title lists go in the
live block, not the stable one. The GM rewrites the plan at beat changes and
creates notes as NPCs appear, both more often than a summary runs, and either
change would otherwise re-price all the history behind it.

```ts
function buildStableBlock(input: { playerSection: string; archetypeSection: string;
  dmInstructions: string; summary?: string }): string;
function buildLiveBlock(input: { /* the sections listed in item 4 */ }): string;
```

### 6.2 Cache marks

`ChatMessage.cacheBreakpoint` (`providerCall.ts` ~line 58) becomes
`cacheBreakpoint?: "prefix" | "turn" | "round"`. Every reader is updated:
`buildRequestMessages` (slice 6), `renderCliPrompt` in `claudeCli.ts`
(~line 256), and the tests that set it. `generation.ts` (~line 2296) marks
the last message of each round's request copy `"round"`, never the stored
`gmBaseMessages`.

`renderCliPrompt` puts everything up to the `"prefix"` mark in the system
file (it used the last mark of any kind), so the file stays the same across
a turn's rounds and grows only at its end between turns.

### 6.3 Tests

`tokenBudget.test.ts`: `sharedPrefixTokens` between two consecutive turns
covers everything up to the previous turn's history end; no per-turn string
(the GM tip, the oracle count, an Observer note) appears in the system
message. `tests/claudeCli.render.test.ts`: the system file is byte-identical
across rounds of a turn. The existing prompt-builder tests are updated for
the new order, each change named in the PR.

## 7. Slice 6 — provider caching and reasoning replay

### 7.1 `app/misc/providerCall.ts`

- `GenerateRequestBody` gains `cacheKey?: string`. `generateStoryTurn` sets it
  to `ys:<storyId>:gm` for GM rounds and `ys:<storyId>:narration` for the
  narrator (`GenerationOptions.storyId` already exists, `generation.ts`
  ~line 220); `callSideModel` takes an optional one.
- **Mistral:** `requestBody.prompt_cache_key = body.cacheKey`. Mistral Small
  3.2's support is unconfirmed (decision 105), so a 400 or 422 whose text
  names `prompt_cache_key` sets a module-level `mistralCacheKeyRejected`, and
  the request is retried once without it; later requests skip it.
- **OpenRouter:** `requestBody.session_id = body.cacheKey` (non-Claude and
  Claude alike).
- **Claude:** `buildRequestMessages` (~line 620) places `cache_control` on
  the system message and on the last message of each mark kind ("prefix",
  "turn", "round"), at most four, never on empty text. Today it marks the
  system and the last marked message only.
- **Reasoning replay:** OpenRouter and Google restore `reasoning` /
  `reasoning_details` only after `lastUserIndex` (the current turn) instead
  of on every message (~line 669). DeepSeek keeps `reasoning_content` on
  every assistant tool call, which its thinking mode requires (~line 727).
  Z.ai already does the current turn only.

### 7.2 Tests

Against a mocked fetch (`tests/providerCall.cache.test.ts`): Mistral bodies
carry `prompt_cache_key`, and a 422 naming it retries without it and stops
sending it; OpenRouter bodies carry `session_id`; a Claude request with all
three marks has four `cache_control` parts; an OpenRouter non-Claude history
carries reasoning on current-turn messages only; DeepSeek keeps it on every
tool call. Standalone build.

## 8. Slice 7 — cached tokens in the ledger

- `GenerateSuccess.meta.usage` (`providerCall.ts` ~line 125) gains
  `cachedTokens?: number; cacheWriteTokens?: number`, read by one helper
  `readCacheUsage(provider, usage)`: OpenAI-style
  `prompt_tokens_details.cached_tokens` / `cache_write_tokens` (OpenRouter,
  Mistral, Z.ai, DeepInfra, Grok); DeepSeek's `prompt_cache_hit_tokens`; the
  `claude` CLI's cache read and creation figures (`claudeCli.ts` ~line 500).
  Both streaming and non-streaming paths (~lines 952, 1235).
- `GenerationMeta` (`generation.ts` ~line 443) and `TurnCostEntry`
  (`turnCost.ts` ~line 203) carry them; `recordAICall` stores them.
- `AIModelConfig` gains `cachedInputPrice?: number`, filled only where a
  dated provider price is known (the design's §2 table; Z.ai's is already
  noted in a comment in `ai_prices.ts`). Without one, the estimate prices
  cached tokens at the full input price and the entry says so.
- `TurnCostPanel.tsx` shows the share of input served from cache per turn.

Tests: `readCacheUsage` for each shape; a ledger entry with cached tokens is
priced at `cachedInputPrice` when set.

## 9. Slice 8 — one trimmed tool list (decision 92)

Measure each offered schema with `estimateTokens(JSON.stringify(schema))`,
then trim the largest first. Behavioural guidance that is already in the
system prompt is not repeated per tool; long examples become one line;
parameter descriptions say what the value is, not how to play. The order
and the offered set are unchanged.

**How a gated tool fits.** The list is built once per request from
*story-level* flags (`storyData.diceMode === "manual"` adds `ask_for_roll`),
never from the turn, the round or the history, so within a story it is the
same on every round of every turn and caches with the prefix. A new optional
tool (the image tool; the default-systems tools, decision 79) joins the same
way: one entry in the whitelist, appended behind a condition that depends only
on a story or settings flag that does not change during play. Flipping the
flag mid-story costs one cache miss and nothing else. A gate that depended on
per-turn state (a scene, a tension level) would break the cache and is not
allowed. The budget test measures the default list under 10,000 and each gated
tool as an extra under its own bound, so a gated tool cannot hide in the
default measurement.

Test (`tests/toolBudget.test.ts`): the tool list `buildGMStagePrompt` offers
for a default story is under **10,000** tokens (from 15,841); the four
default-systems tools are measured separately when they land. The
`engine-review` agent reads the trimmed descriptions against each tool's
executor so nothing the model needs to call it correctly is lost.

## 10. Slice 9 — always-loaded note limits (decision 96)

```ts
// app/misc/contextLimits.ts
export const PINNED_NOTE_WARN_TOKENS = 3000;
export const PINNED_TOTAL_CAP_TOKENS = 10000;
export function pinnedNoteWarning(note: StoryLore): string | undefined; // over 3,000
export function capPinnedNotes(notes: StoryLore[]): { title: string; content: string; cutTokens: number }[];
// shares the cap: notes under an equal share keep everything, the rest split
// what is left; a shortened note ends with
// [… 1,840 more tokens: read_notes "DM Instructions" for the rest]
```

Used by `buildGMStagePrompt` for every pinned note together (the DM
instructions in the stable block, the sheets and the plan in the live
block). Warnings appear in `AdventureInspector.tsx`'s note editor,
`LoreEditor.tsx`, and the Designer's `write_note` result
(`designer_executor.ts`) so the Designer hears it too.

Tests: under the cap nothing changes; over it, the total is at or under
10,000 and each shortened note ends with its pointer; the warning fires at
3,001 tokens.

## 11. Slice 10 — docs, with each PR

- **T1:** the status report gets a dated update under §6.20 (fixed);
  `CLAUDE.md`'s history and compaction description is rewritten (stubs, the
  fixed start, the trigger, the sections, `summary_instructions`).
- **T2:** `CLAUDE.md`'s "Generation" section describes the new message order
  and cache marks and replaces "the GM stage marks the player's action
  `cacheBreakpoint`"; `pending_tests.md` gets §13's checks.
- **T3:** `CLAUDE.md` notes the tool budget and the note limits.
- Every PR: a dated "Decisions made during implementation" section at the
  bottom of this file for any judgment call a slice made.

## 12. What could break, and what catches it

| risk | check |
|---|---|
| The GM loses a fact it read in an earlier turn | short results kept; the stub says "read it again"; summary section 7. Watch re-read counts in the real session |
| DeepSeek 400s on old tool calls | old tool-call rounds keep `reasoning_content` for DeepSeek (slice 6 test) |
| A provider rejecting the new message order (consecutive user messages) | the live block and the action are one message (slice 5) |
| Mistral rejecting `prompt_cache_key` | retried once without it, then skipped (slice 6 test) |
| The prefix not actually stable | `sharedPrefixTokens` in the harness (slices 1, 5) |
| The GM behaving differently with nudges moved next to the action | the Observer's flags in the real session; per-turn notes kept verbatim, only moved |
| Claude's cache marks exceeding four or landing on empty text | slice 6 test |
| A summary missing something important | the sections, the validation and the author's instructions note; "Compact now" to repair |
| Trimmed tool descriptions losing a needed instruction | engine review against each executor |
| Test count moving | each PR states before and after and why |

## 13. What a cloud session cannot verify (`pending_tests.md`, decision 105)

One real session on the default models, after T2 merges, with the author's
go:

- **Mistral's cache:** after the first round, the Turn Cost panel shows
  cached input on Mistral Small rounds. If it never does, the Debug Logs show
  whether the key was rejected (`mistralCacheKeyRejected`) or ignored.
- **Cross-turn hits:** on DeepSeek, turn 2 onwards shows most of round 1's
  input cached. A 0% share means the prefix is still changing; compare two
  turns' requests in the Debug Logs.
- **Recall:** twenty turns after the GM read a note, it still acts on what
  the note said, or re-reads it. A wrong recalled fact means the threshold
  or the summary needs tuning (decision 103).
- **"Compact now":** with a focus, the summary keeps the focused material
  and the next turn continues from the last two turns.
- **Claude** (if the author plays on it): rounds after the first show cache
  reads; turns more than 5 minutes apart do not (decision 104 decides whether
  to move to 1 hour).

## 14. Deliberately not built

- The 1-hour Claude cache (decision 104): measured first.
- A setting for the stub threshold or summary target: constants until
  playtests say otherwise (decision 103).
- Flattening old turns' tool calls into plain text for DeepSeek, which would
  let its old reasoning go too: kept in mind if DeepSeek's history cost shows
  up in the ledger.
- Side agents' prompts, the narrator fallback and the Observer rewrite
  (design §7).
- Fixing §6.19, §6.21 and §6.22: separate changes; none of them is a token saving.

## Decisions made during implementation

### 2026-10-22 - PR T1 (slices 1-4), `claude/token-savings-t1`

Built on master `5dfea85` (PR #216 merged). Baseline before the first edit:
135 files, **2,201 tests**, `tsc` clean. After: 139 files, **2,246 tests**
(+45: `historyStubs` 17, `compaction.trigger` 11, `compaction.summary` 12,
`tokenBudget` 5, and `compaction.test.ts` one test rewritten, net 0).

- **Harness fixture carries a 120-token `<thinking>` per turn.** The design's
  scratch fixture did not, so on master the same harness reads 1.91x / 4.98x /
  14.22x (prose-only, a read every fourth turn, every turn) where the design
  said 1.0 / 3.5 / 11. After slices 2-3: 1.08 / 1.21 / 1.59. The design turn's
  round 1 went from 40,519 to 30,334 tokens (messages plus the tool list).
  `tests/tokenBudget.test.ts` asserts the "after" numbers with loose bounds.
- **`getPartsWithinTokenBudget` gained a `measure` argument** (`"prose"`
  default, `"rendered"`). The choices prompt (`buildInfoMessage` path) sends
  prose only, so it keeps the prose count; only the GM's sliding fallback
  counts rendered sizes. Rendered mode never skips a part (so `startIndex` is
  exact); `renderHistoryPart` returns nothing for a comment-only user part.
- **`renderHistoryPart(part, index, options)`** takes `isMostRecentRound` as a
  third argument (the plan's two-argument signature cannot know which
  assistant part is last). `index` is the part's absolute position in
  `scene.parts` (`historyStartIndex + i`), used only for legacy synthetic
  tool-call ids.
- **Dice and oracle results are never stubbed**, however long
  (`KEEP_WHOLE_TOOLS` in `historyStubs.ts`: `formula_roll`, `opposed_formula`,
  `gm_roll`, `npc_roll`, `calculate`, `fate_question`, `roll_table`,
  `roll_portent`, `ask_for_roll`, `ask_question`). Decision 90 says dice and
  oracle results stay; a roll echoing both consequence branches can pass 150
  tokens and a stub would lose what the dice showed.
- **The most recent past turn is stubbed too.** Only its `reasoning_details`
  are kept (as before); its tool-call arguments and results are stubbed like
  every older turn's, so a turn changes form once, when it becomes history.
- **Thinking-only rounds and legacy thinking are dropped, not emitted empty.**
  An assistant message with no tool calls and no visible text is skipped, and
  the legacy `gmThinking` / `gmStoryContext` branches no longer synthesise
  `<thinking>` messages (decision 99). A thinking-only turn (status report
  6.19) therefore renders to nothing, which can leave two user messages in a
  row; master could do the same for an empty part.
- **Fold cutoff rules beyond the plan.** `planCompaction` keeps the latest part
  live even if it alone is over the target, moves the cutoff forward one part
  to keep a reply with its action, and takes the scene-boundary snap only when
  the boundary is before the last part.
- **"Compact now" removes nothing.** The plan said `summarizeOldNarrative`
  gains `focus` / `keepRecentParts`; it did (so the old destructive checkbox
  can use them), but *Summarise Now* calls a new `summarizeNow()` instead,
  which folds all but the last four parts into the summary and moves
  `summarizedThroughIndex`, leaving `scene.parts` intact. Truncating the story
  the player scrolls through for a convenience button would be a data-loss
  surprise; the fixed history start gives the same token effect.
- **The summariser reads tool use from `gmConversation` only**, as
  `[GM called name {args}]` / `[name result: ...]` lines before the prose. A
  part pruned by the Compact Story "clear old debug data" lever has no
  `gmConversation` and summarises as prose alone.
- **The instructions and focus go in the summary call's system message**, so
  the one revision call (same system message) keeps them.
- **`summary_instructions` is kept out of the GM and narrator prompts**
  (`categorizeNotes`, `isExcludedFromWorldLore`) but not out of `read_notes` /
  `search_notes`: a GM that searches for the note's words can still read it.
  It cannot find its title in any list. Not worth a tool-level filter now;
  the note holds the author's summary rules, not secrets.
- **`create_note` / `edit_note` enums are unchanged**: the GM cannot create a
  `summary_instructions` note. The Designer, the lore editor and both library
  pickers can.
- **No `engine-review` agent run from this session** (no agent tool was
  available to the builder): the coordinating session ran it; its fixes are
  below.

### 2026-10-22 - after the engine review (PR T1)

Tests 2,246 to 2,256 (+10). New tests use the run-time shape: the last part of
`scene.parts` is the current player action.

- **Validation runs on prose.** `CompactionPlan.proseToSummarize` (new
  `partToProseText`) is what `validateCompactionSummary` checks; the
  summariser still reads `textToSummarize` with the tool text.
- **The last action-reply pair stays live.** `planCompaction` treats a
  trailing user part as the current action, always keeps the pair before it,
  and may move the cutoff backward (history starts at
  `summarizedThroughIndex`) to avoid splitting an action from its reply.
- **Thinking-only turns** render as one placeholder assistant message
  (`EMPTY_TURN_PLACEHOLDER`), so no two user messages in a row.
- **Narrator prose reaches history:** `part.content` is appended when a
  `gmConversation` does not already end on visible assistant prose.
- **Scene-boundary snap** goes to `boundary - 1` when that part is the
  player's, so an action is not split from its reply; its test rewritten.
- **Reasoning is not counted** by `estimateRenderedPartTokens` (chosen over
  per-provider counting): whether reasoning is replayed is per provider and
  slice 6's job; counting it overstated Claude's history.
- **Hidden material:** the summary prompt says unrevealed material stays
  marked as unrevealed.
- **Tool results in the summary input are capped** at
  `SUMMARY_INPUT_RESULT_CAP_TOKENS` (600) with "...(truncated)".
- **Minor:** `increment_scene` joins `KEEP_WHOLE_TOOLS`; a stubbed `**ERROR**`
  result keeps its first line.
- Skipped as told: the tokenizer-load cache miss and object-shaped arguments.

### 2026-10-22 - PR T2 (slices 5 and 6), `claude/token-savings-t2`

Built on master `e80c7f6` (T1 merged). Baseline before the first edit: 139
files, **2,256 tests**, `tsc` clean. After: 142 files, **2,283 tests** (+27:
`providerCall.cache` 10, `aiStaged.stablePrefix` 10, `claudeCli.prefix` 4,
`tokenBudget` +2, `providerCall.reasoning` +1; five existing tests updated,
net 0). Slice 7 (cached tokens in the ledger) is **not built** in this PR:
the brief for T2 named slices 5 and 6. Everything else in the plan's T2 row
is here. The harness now measures **11,165 of 14,598 message tokens shared
between consecutive turns** (was 0): the system prompt, the stable block and
all the previous turn's history; only the live block, the action and the
new history tail differ. No `engine-review` agent ran from this session (no
agent tool was available to the builder); the coordinating session should run
it on the diff.

- **`cacheBreakpoint` is `"prefix" | "turn" | "round"`** in both `ChatMessage`
  types (`providerCall.ts`, `chatMessage.ts`). Five tests that set `true`
  now set `"turn"`.
- **The helpers for the marks and the key live in a new `cacheMarks.ts`**
  (`storyCacheKey`, `markRoundBreakpoint`), not in `generation.ts`, so
  `generation.ts` takes three small edits (an import, two spreads, one call)
  and the merge with the image-generation branch stays small. The round mark
  goes on a copy of the request's last message and only when the round has
  history appended (a first round's last message already carries `"turn"`).
- **The stable block always exists.** The old code skipped the state message
  if it was under 100 characters, which its header alone never allowed; the
  block is now unconditional, so the acknowledgement always follows it and
  `"prefix"` always has a message to land on.
- **Per-turn blocks keep their text, with one added heading.** The pacing line
  was the tail of the Length & Pacing paragraph; in the live block it sits
  under "PACING NOTE (this turn)". The setup blocks, the four notes and the GM
  tip are verbatim, after the state sections and right before the action.
- **The live block opens with a "LIVE GAME STATE (this turn)" rule, the stable
  block with "THE STORY'S FOUNDATION (changes rarely)"**, replacing the one
  "CURRENT GAME STATE" header.
- **The CLI split.** `renderCliPrompt` splits after the last `"prefix"` message
  when something follows it; a request with only a `"turn"` mark keeps the
  old split (before the marked action), so a caller without a prefix mark
  behaves as before.
- **Claude's third mark can land on a `tool` message** (a round after a tool
  call ends in one). Its content goes out as a list of text parts with
  `cache_control`, like the other marks. Whether OpenRouter forwards that on a
  `tool` message is unverified; it is the first entry in `pending_tests.md`
  for Claude, with the fallback (mark the assistant message before it).
- **Mistral's rejection check** reads the error text with `response.clone()`
  and looks for `prompt_cache_key` in a 400 or 422; the retry runs once, the
  flag is module-level and survives for the session, and
  `resetMistralCacheKeyRejected()` exists for tests.
- **OpenRouter's `session_id` is cut to 128 characters** (its documented
  limit); a story id plus `ys:` and `:narration` is far under it.
- `callSideModel` gained an optional `cacheKey` but no caller passes one (the
  side agents are not a conversation to keep warm).

### 2026-10-22 - after the engine review (PR T2)

- **The round mark never lands on a `tool` message** (the earlier decision
  that it could is withdrawn). `markRoundBreakpoint` walks back to the last
  non-tool message with text and puts no mark if that one is already marked
  or there is none; a tool-only round therefore gets no round mark.
- **`cachedAtFullPrice` is set only without a provider-reported cost**, since
  `effectiveUsd` prefers OpenRouter's `usage.cost`, which already has the
  discount.
- Anthropic's cache lookback is about 20 content blocks. After a turn with
  about 10 or more tool calls, the next turn's `prefix` mark will miss, so the
  history is re-written at 1.25x; the harness's shared-token count overstates
  Claude's saving on tool-heavy turns. A possible fix later is an intermediate
  history mark.
- The Mistral retry can fire once on an unrelated 400 whose body echoes
  `prompt_cache_key`. That is accepted.
- `ai_staged.ts`: the `get_game_state` line said "the state shown above"; it
  now says "the state in the live block".

### 2026-10-22 - PR T2, slice 7 (cached tokens in the ledger), added after the first report

Tests 2,283 to 2,291 (+8: `cacheUsage` 8; `claudeCli.fetch` and `turnCost`
fixtures updated). Supersedes the "slice 7 not built" lines above.

- **`readCacheUsage(provider, usage)`** (`providerCall.ts`) reads
  `prompt_tokens_details.cached_tokens` / `cache_write_tokens`, and for
  DeepSeek `prompt_cache_hit_tokens`. Zero reads as absent. Both the streaming
  and non-streaming paths put `cachedTokens` / `cacheWriteTokens` on
  `meta.usage`; `claudeCli.ts`'s `usageOf` fills them from the CLI's
  `cache_read_input_tokens` / `cache_creation_input_tokens` (summed over a
  retry). The CLI's `promptTokens` already included both, as before.
- **Cached tokens are part of `promptTokens`**, not extra. `priceCall` takes an
  optional `cachedTokens` (clamped to the prompt), prices them at
  `cachedInputPrice` or, without one, at the plain input price, and the entry
  gets `cachedAtFullPrice: true` so the panel can say its dollar figure
  overstates that call. A provider-reported dollar figure (Claude's
  `usage.cost`, DeepInfra) still wins in the totals, as before.
- **Cache-write premium is not priced.** Claude's 1.25x writes are recorded
  (`cacheWriteTokens`) but not added to the estimate: Claude is billed at
  OpenRouter's own `usage.cost` anyway.
- **`cachedInputPrice` is filled only where a dated price was already in the
  file's comments**: Grok 4.5 ($0.30), Grok 4.7 ($0.50), GLM 5.3 and 5.3 Flash
  on Z.ai ($0.26, $0.03), Mistral Large 4 ($0.14). DeepSeek's and Gemini's
  comments give prices that are off-peak or date-limited, so those stay
  empty for now.
- **Wired into** the GM rounds, narration and choices ledger entries
  (`generation.ts`) and `recordSideCall` (every side agent). The one-off tier
  classifier is not wired (its prompt is tiny). `GenerationMeta.usage` sums the
  GM rounds' cached figures.
- **The Turn Cost panel** shows "N% of input from cache" next to the last
  turn's token counts when any call reported a hit; its tooltip says when some
  models were priced without a cached rate. Not seen rendered (no browser in
  this session): it is a text span in an existing line.
- **The estimate side (`turnCostEstimate.ts`) is untouched**: it still
  predicts at full input price, now an overstatement once caching works.
  Calibration against real turns is the follow-up, after the live check.

### 2026-10-22 - PR T3 (slices 8 and 9), `claude/token-savings-t3`

Built on master `be0bc6e` (T1 and T2 merged). Baseline before the first edit:
143 files, **2,292 tests**, `tsc` clean. After: 145 files, **2,304 tests**
(+12: `toolBudget` 4, `contextLimits` 8; no existing test changed). The
default tool list went from **15,841 to 9,686 tokens** (`estimateTokens` of the
JSON, 56 tools); with `ask_for_roll` in Manual Dice Mode it is 9,933. No
`engine-review` agent ran from this session (no agent tool was available to
the builder); the coordinating session should run it on the descriptions
against their executors.

- **How the trim was done.** Measured every offered schema, then rewrote the
  descriptions of the 20 largest (the whole description for each, as one short
  paragraph) and shortened the longest parameter descriptions. Nothing else
  changed: no parameter was added, removed, renamed or re-typed, no `required`
  list or enum was touched, and the offered set and order are as before.
  Largest cuts: `fate_question` 858 to 324, `roll_portent` 840 to 285,
  `formula_roll` 786 to 434, `add_combatant` 783 to 381, `generate_name` 655 to
  323, `gm_roll` 565 to 265.
- **What a description kept, and what went.** Kept: what the tool does, when
  it is the right tool, the non-obvious rules the executor enforces (attitude
  moves two steps, `npc_roll` only on the active combatant, `start_game`
  needing the Campaign Plan note, `record_challenge_result` being the third of
  three calls), the fate result meanings (they exist only here), and the
  built-in `roll_table` names. Cut: worked examples (one line, or none),
  "use when" lists that restated the system prompt, per-rung glosses of the
  eleven fate likelihoods (the enum already orders them), repeated "decided
  before the dice land" and "echoed back" explanations on three tools, and the
  second and third copies of a parameter's explanation.
- **One list, no per-situation lists.** The only gate today is
  `ask_for_roll`, which depends on `storyData.diceMode`, a story setting; the
  slice 8 section now says how a later gated tool (images, default systems)
  joins without breaking the cache. `tests/toolBudget.test.ts` also asserts the
  list is byte-identical for a story with 2 prior turns and one with 16.
- **The test's bounds.** Default list under 10,000 (9,686 today, so about 300
  tokens of room); the manual-dice extra under 400 (247 today). A gated tool
  added later should get its own bound next to the manual-dice one rather than
  loosen the default.
- **Pinned notes are three types, not four.** The plan's list was "DM
  instructions, a character sheet, the campaign plan". The mechanics note is
  *not* sent in full by the GM prompt (it is listed by title and read on
  demand), so it is not pinned for the cap or the warning, although the
  Designer forces it `alwaysOn`. `gm_notes`, the legacy alias of
  `dm_instructions`, is included because the prompt sends it as DM
  instructions.
- **The cap shares by water-filling.** Notes at or under an equal share keep
  everything; what they leave is shared among the rest, repeating until none
  is under its share. The shortened note's allowance includes its own pointer
  line, and the front is kept, cut back to a line break when one is within the
  last fifth. The pointer is exactly the plan's: `[… 1,840 more tokens:
  read_notes "Title" for the rest]`.
- **Where the cap applies.** `buildGMStagePrompt` only: the DM instructions in
  the stable block, the sheets and the plan in the live block. The choices and
  the narrator's prompts (`buildInfoMessage`) are untouched: they have their
  own budgets. A note shortened for the prompt is never saved shortened.
- **A known soft spot.** A GM that edits the campaign plan from its shortened
  view with a whole-note `edit_note` would overwrite the part it did not see.
  The pointer says tokens are missing and to `read_notes`, and the plan's
  edits are mostly `edit_lore_*` and checklist ticks, so this was left; the
  live check in `pending_tests.md` watches for it.
- **The warning's three homes.** The Adventure Inspector's note card and the
  lore editor's content box show an amber line under the text for a pinned
  type over 3,000 tokens; the Designer's `write_note` result ends with
  "WARNING: ..." so the Designer relays it. All three come from
  `pinnedNoteWarning`. The Debug Logs line (console) in `buildGMStagePrompt`
  names a note over the line and the tokens the cap left out. Not seen
  rendered (no browser in this session).
- **Not touched.** The Google `GOOGLE_ESSENTIAL_TOOLS` list, the labels and the
  observer registration: no tool was added, removed or renamed, so all six
  places still agree.

### 2026-10-22 - after the engine review (PR T3)

Tests 2,304 to 2,310 (+6 in `contextLimits.test.ts`, one existing test there
reworked for the new DM share).

- **The cap keeps the plan's current beat (decision 110).** `capPinnedNotes`
  splits a `gm_plan` note at its last `\n## Current beat` section, budgets that
  section out of the cap first (bounded to half the cap), shares the rest among
  the fronts, and writes `front + pointer + beat`. `cutTokens` counts the front
  only.
- **`edit_note` refuses a rewrite from a shortened view.** New
  `wholeNoteRewriteRefusal` (`toolExecutor.ts`): refused when the new content
  carries the `[… N more tokens: read_notes "` pointer, or the note is a pinned
  type whose prompt form is cut and `notesReadThisTurn` is false. The message
  points to `read_notes` / `edit_lore_replace`.
- **The DM instructions' cut is independent of the sheet and plan.** New
  `capPinnedForGM`: the DM instructions are capped alone at
  `DM_INSTRUCTIONS_CAP_TOKENS` (4,000, a judgment call for "a fixed share"),
  then the sheets and the plan share the 10,000 total minus what the DM
  instructions took. The stable block is therefore byte-identical when the
  sheet grows. Both `buildGMStagePrompt` and `edit_note` call it, so they agree
  on what is shortened.
- **Descriptions.** `add_combatant`: "`lore_ref` links a note."
  `manage_timer`: no longer says `auto_advance` ticks (§6.1). `ask_for_roll`:
  secret rolls are `gm_roll`.
- **Comments** in `buildGMStagePrompt` about the plan and mechanics notes
  corrected. The tool list is still under the 10,000 bound.
