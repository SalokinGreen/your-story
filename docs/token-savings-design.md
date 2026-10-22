# Token savings: history, caching and compaction — design

**Status:** approved, 2026-10-22 (decision 106). Decisions 90–106 in
[`decisions.md`](decisions.md). It goes before default systems' PR A
(decision 97), which then builds on the prompt layout set here. The
implementation plan is
[`token-savings-implementation-plan.md`](token-savings-implementation-plan.md);
building waits for the author's yes on it.

## 1. What this is

The author asked how to improve the notes and memory system and save on
tokens, and named one thing as certain: "the compaction tool of claude
code". Measuring the turn showed that memory itself is cheap and that the
cost is in what every request carries and resends. So this design is about
the **prompt the GM gets each round**, the **history** inside it, and the
**summaries** that replace old history, in Claude Code's manner. On memory
the author's answer was "mostly just cost" (decision 93), so recall quality
is not redesigned here.

## 2. Where a turn's tokens go today

Measured on 2026-10-22 with the app's own estimator (cl100k), by driving the
real `generateStoryTurn` against a recording `fetch` (no provider called, no
keys). The story is synthetic: a 1.2k character sheet, 1.5k of DM notes, a
1k campaign plan, 2k notes read on demand, 27 memories, 6 NPCs, 16 earlier
turns, Memory Size 36k, default tiers. Real stories differ in size; the
shape is what matters.

| what | measured |
|---|---|
| One turn, 4 GM rounds, three 2k `read_notes` | **165,957** input tokens to the GM |
| …of which tool descriptions (15,841 every round) | 63,364 (38%) |
| …of which the system prompt (~6.2k every round) | 25,016 (15%) |
| Each round's growth | the whole previous round plus its new results (38.4k → 40.4k → 42.5k → 44.6k) |
| Earlier turns' history the window *counts* vs what is *sent* | equal for prose-only turns; **3.5×** when the GM reads a note every fourth turn; **11×** when it reads one every turn |
| A GM round at turn 40, a note read every turn | ~90k tokens of history against a 21.6k budget; the whole request 116k |
| Prefix shared with the previous turn | none: the first difference falls inside the system prompt, about 6.2k tokens in |
| Side agents per turn (Observer judges, Memory Keeper) | ~4–5k; the Story Progress check ~4k every 10th turn |
| Memory in the prompt | under 1k |

Why it is so:

- **Every tool result and tool argument is replayed.** Within a turn,
  each round resends every earlier round, which is expected. But each turn's
  tool calls and results are also saved on its story part
  (`gmConversation`) and rebuilt into every later turn's history
  (`ai_staged.ts`, the history loop), while the history budget counts only
  prose (`getPartsWithinTokenBudget`). An `edit_note` costs twice: its
  arguments carry the whole note body.
- **Caching cannot carry across turns.** The rotating GM tip sits at the
  end of the system prompt (`ai_staged.ts`, `gmAdviceSection`); the state
  message changes every turn ("Turns since you last consulted the oracle",
  the memory count, NPCs, timers); and once the window binds, history drops
  its oldest turn each turn, changing its first message.
- **The app leaves caching unused on the default model.** Mistral caches
  only when a request carries `prompt_cache_key`, which the app never sends,
  and Mistral Small 3.2 is the default tier-1 and narration model.
- **Old reasoning is replayed** on DeepSeek and the non-Claude OpenRouter
  models (about 0.8k per round in the measurement); Claude's and Z.ai's
  branches already replay only the current turn's.
- **The cost ledger cannot see any of this**: it records prompt and
  completion tokens, not cached ones.

What caching costs where it applies (checked 2026-10-22; prices move):

| provider | how | a cache hit costs |
|---|---|---|
| DeepSeek | automatic, lasts hours | ~2–3% of normal input |
| Mistral | opt-in `prompt_cache_key`, 64-token blocks | 10%; support for Small 3.2 not confirmed |
| Kimi K3 | automatic, 5-minute default | 10% |
| Grok 4.x | automatic | 15–25% |
| Claude (via OpenRouter) | `cache_control` breakpoints, 5-minute default, refreshed on use | 5–10%; writes 1.25× |
| Google Gemini | implicit, automatic | 10% |
| Z.ai GLM | automatic | ~19% |
| OpenRouter | passes through; sticky routing for 10 minutes, or by `session_id` | per upstream |

## 3. What Claude Code does, and what we take from it

Claude Code compacts in two steps: **it clears old tool outputs first, and
only summarises the conversation if that is not enough**. After a summary it
re-loads what must not be lost (CLAUDE.md, recently edited files, the plan).
`/compact <focus>` steers one summary, and a "Compact instructions" section
in CLAUDE.md steers all of them. Between compactions the conversation only
grows at the end, so its prefix stays cacheable. (Its summary's headings are
not published; ours are our own, §4.3.)

The app has only the second step, and only for prose: tool results are
never cleared and never summarised, and the window slides every turn. So:

| Claude Code | here |
|---|---|
| clear old tool outputs | §4.1, decision 90 |
| summarise when the context is full | §4.3, decision 94 |
| `/compact <focus>` | "Compact now" with focus, §4.3 |
| "Compact instructions" in CLAUDE.md | a summary-instructions note per adventure, §4.3 |
| re-load the essentials after a summary | the always-loaded notes are re-sent every round already |
| grow at the end between compactions | a fixed history start, §4.2 |

## 4. The design

### 4.1 Old tool results become stubs, once (decision 90)

When a turn becomes history, each of its **tool results longer than about
150 tokens** is replayed in later turns as a one-line stub instead of in
full:

`[read_notes "B&B — Vampire": 2,029 tokens, cleared from history. Read it again if you need it.]`

- **Long tool arguments** are stubbed the same way (`edit_note`'s body
  becomes `[note body, 2,010 tokens, saved to "Character: Mira"]`).
- **Short results stay whole**: dice and oracle results, `calculate`'s
  TRUE/FALSE, state-change confirmations. They are what a later turn most
  needs to stay consistent, and they cost little.
- **Old turns' private `<thinking>` text** is dropped from history on the
  same rule (the prose the player saw stays; decision 99). The GM reasons
  afresh each turn; its old reasoning is cost, not memory.
- **Nothing is cleared within the current turn.** The rounds of a turn
  share their prefix exactly as today.
- **Stored in full, stubbed when sent.** The story part keeps its full
  `gmConversation` (for the summary, §4.3, and for debugging); the history
  builder stubs it deterministically, so a given turn renders to the same
  bytes every time. That is what makes this cache-safe: a turn changes form
  once, when it becomes history, at the end of the prefix, and never again.
  A rolling "keep the last N turns" would change a message in the middle of
  the prefix every turn, which is why it was not chosen.

### 4.2 A stable prefix (decision 91)

The request is reordered by **how often each piece changes**, so each
request mostly matches the one before it:

| # | block | changes | today it sits |
|---|---|---|---|
| 1 | tool descriptions | never within a story | (sent alongside) |
| 2 | system prompt, with nothing per-turn in it | never | first, with the GM tip and per-turn notes inside |
| 3 | the adventure: always-loaded notes that rarely change (DM instructions, campaign plan) and the note-title lists | when those notes change | in the state message, after the summary |
| 4 | the story-so-far summary | at a summary (§4.3) | first in the state message |
| 5 | history, from the summary's end | grows at the end | after the state message, sliding |
| 6 | **the live block**: the character sheet, NPCs, goals, threads, timers, combat, meters, director moves, pending events, the oracle line, the memory count, the GM tip, Observer and pacing notes | every turn | spread through the system prompt and the state message |
| 7 | the player's action and the turn instructions | every turn | last |
| 8 | this turn's rounds | every round | after the action |

- **History has a fixed start.** It begins where the summary ends, and
  everything after the summary is sent; it only grows at the end until the
  next summary moves the start forward (§4.3). This also closes the gap in
  status report §6.20, where story could fall between the window and the
  summary.
- **The character sheet moves into the live block** because the GM edits it
  often (decision 100); DM instructions and the plan change rarely and stay
  early.
- **Claude gets four breakpoints** (its maximum): after the system prompt,
  after history (the end of the previous turn), after the action (shared by
  this turn's rounds), and on the latest message of each round. Today it has
  two, so a turn's later rounds pay full price for everything after the
  action.
- **The `claude` CLI route** puts blocks 1–5 in the system-prompt file and
  the rest on stdin, so the file is the same across turns.

Moving the per-turn lines next to the action also puts the GM's nudges and
live state where models weigh text most: right before they answer.

### 4.3 History and summaries (decisions 94 and 95)

**When.** The history is measured as it is actually sent: prose, stubs, and
anything else replayed. When it passes the history share of Memory Size (60%,
21.6k by default), a summary folds in the oldest turns until history is back
to about half that share (decision 101). The margin means a summary runs
every few dozen turns rather than every turn, and the prefix stays cached in
between. The
summary runs before the GM's first round, as compaction does today. If it
fails, that turn falls back to today's sliding window so the request still
fits, and the summary is retried next turn.

**What it is given.** The prior summary, the turns being folded in **with
their full tool results and arguments** (decision 95, "summarise tool use
too"): what the GM read, rolled, changed and learned, not only the prose. The
adventure's summary instructions and any "Compact now" focus are added.

**How it is written.** Fixed sections, the whole summary rewritten each
time:

1. Where things stand now
2. What the player is pursuing
3. Open threads, clocks and pressures
4. People: each NPC's state, attitude to the player characters, whereabouts
5. Places and things
6. Promises, debts, and secrets revealed (who knows what)
7. What the GM has established from notes and rolls

It keeps today's validation (names that went missing, dead NPCs described as
present, and one revision call) and gets a size target of about 2,000 tokens.
It still runs on the narration model unless the player pins another in
Settings > Architecture (decision 19).

**"Compact now."** The story menu's Compact Story dialog
(`app/story/menu/CompactStoryModal.tsx`) gains a *Summarise now* action
with an optional focus ("keep everything about the Salon"). It folds all
but the last two turns into the summary immediately (decision 102), like
Claude Code's `/compact <focus>`.

**Summary instructions.** A new note type, `summary_instructions`, read only
by the summariser, never by the GM or the narrator: the author's standing
instructions for every summary of that adventure ("always keep Exposure and
Heat changes; keep who knows the PCs' secret"). The Designer can write one
like any other note, and a default system can ship one.

### 4.4 One stable tool list, trimmed (decision 92)

Every tool stays in every round, in the same order, so the list caches with
the prefix. The descriptions are cut to what the model needs to call each
tool correctly. Long behavioural guidance already in the system prompt is
not repeated per tool, and examples become one line. Target: **well under
10,000 tokens** for today's list, down from 15,841, held by a test. Decision
79's switch for the default-systems tools is fixed per story, so it never
changes the list between turns.

### 4.5 A size limit on always-loaded notes (decision 96)

- **A warning** in the Designer, the Adventure Inspector and the lore editor
  when one always-loaded note (DM instructions, a character sheet, the
  campaign plan) passes about **3,000 tokens**, and in the GM prompt's debug
  log.
- **A total cap** of about **10,000 tokens** for all of them together. Past
  it, the GM prompt sends the first part of each, sharing the cap between
  them, and ends each shortened note with
  `[… 1,840 more tokens: read_notes "DM Instructions" for the rest]`. The GM
  can always read the full note.
- Blood & Bone's core (≤ 3,000, default-systems design §3.1) fits under both.

### 4.6 Provider caching, and seeing it

None of these needs a product decision; they are what the providers' own
documentation says to do.

- **Mistral:** a stable `prompt_cache_key` per story and stage (the GM's
  rounds one key, the narrator another). Whether Mistral Small 3.2 honours it
  is unconfirmed: the first real call will tell (§7).
- **OpenRouter:** a `session_id` per story (the story's local id), so
  routing sticks to one upstream provider and its cache for the whole
  session, not only for 10 minutes after a hit.
- **Claude:** the four breakpoints in §4.2.
- **DeepSeek, Kimi, Grok, Gemini, Z.ai:** automatic; the stable prefix is
  all they need.
- **The ledger records cached tokens.** `TurnCostEntry` gains cached and
  cache-write tokens, read from each provider's own usage fields (DeepSeek's
  `prompt_cache_hit_tokens`, OpenAI-style `prompt_tokens_details.cached_tokens`,
  Anthropic-style `cache_read_input_tokens`). Estimates use the cached price
  where a model's price list has one, and the Turn Cost panel shows the share
  served from cache. Without this the savings cannot be measured, and the
  shown costs overstate them.

### 4.7 Reasoning: the current turn only

DeepSeek and the non-Claude OpenRouter models get their native reasoning
back only for the current turn's tool loop, as Claude's and Z.ai's branches
already do. The implementation plan checks each provider's documented
requirement first, since a tool loop that needs its reasoning back must
still get it within the turn.

### 4.8 Memory (decision 93)

Memory costs under 1k a turn, and the author sees no recall problem, so it
stays as it is. Two things change: the memory-count line moves into the live
block (§4.2), and bug §6.21 (trimming against reflection's index) is logged
for a separate fix.

## 5. Expected effect (an estimate)

Arithmetic on the measured turn in §2, with the tool list at 9k, history
stubbed (prose 3.25k plus stubs), and this turn's three 2k reads unchanged.
It assumes cache hits wherever the prefix matches and the cache is still
alive. Real numbers come from the ledger once §4.6 lands.

| | today | after |
|---|---|---|
| Raw input, the four rounds | 165,957 | ~108,000 (−35%) |
| DeepSeek, counting each cache hit at its price | ~25,000 (rounds 2–4 already hit within the turn) | ~10,000 |
| Mistral Small, the same way, if it honours the cache key | 165,957 (nothing cached) | ~18,000 |
| Mistral Small, if it does not | 165,957 | ~108,000 |
| History per round at turn 40, a read every turn | ~90,000 | ~9,000, then summarised past 21.6k |

The longer a story runs and the more the GM reads, the bigger the saving,
because the 3.5–11× replay is what grows.

## 6. What it touches

For the implementation plan to turn into signatures and slices:

- `app/misc/ai_staged.ts`: the message order (§4.2), the history builder
  (fixed start, stubs, thinking dropped), the live block, the always-loaded
  cap, the GM tip's new place.
- `app/misc/compaction.ts`: the real-size trigger and target, the fixed
  start, the sections, the instructions note, the focus, tool use in the
  input.
- `app/misc/generation.ts`: running the summary before the GM rounds with the
  new trigger; the sliding-window fallback.
- `app/misc/providerCall.ts`: Mistral's key, OpenRouter's `session_id`,
  Claude's four breakpoints, cached-token usage for every provider, reasoning
  replay for the current turn only.
- `app/misc/claudeCli.ts`: the system file and stdin split on the new
  layout.
- `app/misc/turnCost.ts`, `app/components/TurnCostPanel.tsx`,
  `app/misc/ai_prices.ts`: cached tokens and cached prices (today only
  Z.ai's entry notes a cached price, in a comment).
- `app/misc/gmTools.ts`, `app/misc/toolSchemas.ts`: shorter descriptions.
- `app/misc/structs.ts`: the `summary_instructions` note type; the cached
  fields on the ledger entry.
- `app/misc/mythic.ts` (`formatOracleRecencyLine`), `gmAdvice.ts`: their
  lines move into the live block.
- `app/story/menu/CompactStoryModal.tsx`, `app/story/menu.tsx`: *Summarise now*
  with a focus.
- `app/misc/designer_tools.ts`, `app/creator/AdventureInspector.tsx`,
  `app/story/menu/LoreEditor.tsx`: the size warnings and the new note type.

## 7. Out of scope, and what stays open

**Out of scope:**
- Memory recall (decision 93).
- The side agents' prompts (about 3% of a turn).
- The narrator fallback and the Observer's rewrite. Each resends the turn's
  GM conversation when it runs, and both are conditional.
- Smaller tool lists by situation (decision 92 chose a stable list).
- Server-side compaction from a provider: Anthropic's is beta, Claude-only,
  and not documented through OpenRouter; the app's own works on every model.

**Settled by the author (decisions 103–105), measured after the build:**
- Whether Mistral Small 3.2 honours `prompt_cache_key`, and the real hit
  rates against §5: one real session on the default models once the ledger
  records cached tokens (decision 105), a pending test until the author says
  go.
- Claude's cache stays at 5 minutes; the stable prefix moves to the 1-hour
  cache (writes 2× instead of 1.25×) only if the ledger shows Claude players
  missing between turns (decision 104).
- The stub threshold (about 150 tokens) and the summary target (about
  2,000) ship as constants and are tuned in playtests (decision 103).

## 8. Risks

- **The GM loses a fact it read earlier.** That is the point of the stubs'
  "read it again", of the summary's section 7, and of keeping short results.
  Watch for re-reads every turn, which would mean the threshold is too low.
- **The live block moving changes the GM's behaviour.** Nudges right before
  the action may be weighed more heavily. Watch the Observer's flags before
  and after.
- **Summaries drift.** A wrong summary is permanent until the next one. The
  fixed sections, the validation, and the author's instructions note limit
  that; "Compact now" lets a player repair one.
- **Prompt caching on the `claude` CLI** depends on the system file staying
  byte-identical. A test pins it.

## 9. Verification

- **Unit tests:** the stub renderer is deterministic, stubs only past the
  threshold, and keeps short results; a turn renders identically on two
  consecutive turns; the history start equals the summary's end; the
  trigger counts real tokens; the cap shares 10,000 and appends the pointer;
  the tool list is under its budget.
- **The measurement harness** (the one behind §2, made into a test): the
  prefix shared between two consecutive turns is everything up to the new
  history; the fixture turn's input falls as §5 estimates.
- **Builds:** the suite, `tsc`, the standalone export.
- **Engine review** for every slice in `app/misc/`.
- **Needs the author** (`pending_tests.md` when built): one real session on
  the default models, with the Turn Cost panel's cached share. Check that
  Mistral reports `cached_tokens` with the key, that DeepSeek's hits appear
  after the first turn, and that the GM still recalls a fact from a note it
  read twenty turns earlier.
