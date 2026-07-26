# The Five-Layer Architecture: What Two Research Papers Changed

## Purpose of this document

Two research papers ("Architecting the Autonomous AI Game Master" and its
follow-up "Bridging Theory to Code") drove a large, two-phase engineering
effort on this codebase. This document is the "how it was before, and what
changed" record — a plain answer to "what did this huge jump actually mean"
for anyone who wasn't following the individual commits. See also
`docs/ai-gm-integration-plan.md` and `docs/ai-gm-deep-audit-findings.md`
for the original phase's detailed technical notes, and
`docs/event-sourcing-alternative.md` for a related proposal that was
deliberately **not** built.

## The core idea both papers argued for

> **"LLM proposes, deterministic engine disposes."** The model narrates and
> requests actions; canonical truth, dice/oracle results, pacing decisions,
> and rule enforcement all live in deterministic code the model cannot
> override.

Every change described below is in service of that one sentence. The
papers identified five layers a fully-realized system needs: **state,
entropy/oracle, director/pacing, memory, adjudication** — and argued that
every well-documented LLM-GM failure mode (sycophancy/"yes-man" behavior,
memory drift, rule hallucination, auto-success) is a direct consequence of
putting authority for one of those five things inside the model instead of
outside it.

## How it was before (the starting point)

Before this work began, an audit found the app already implemented most of
layers 1, 2, and 4 in recognizable form — this was never a "naive AI
Dungeon clone" rebuild. The honest gap assessment at the time was:

| Layer | Status before this work |
|---|---|
| **(1) Deterministic state** | Mostly solid — `StoryData` already authoritative, mutated only through tool calls. |
| **(2) External oracle/entropy** | Mostly solid — real dice (`diceFormula.ts`), Mythic fate chart, chaos factor. |
| **(3) Director/pacing** | **Missing entirely.** No tension curve, no beat-type selection, no GM-move menu, no spotlight tracking, no player model. Mythic's own scene-check mechanic existed in code but was never called from anywhere. |
| **(4) Memory** | Mostly solid — rolling summarization, pgvector semantic search — but memories carried no timestamp, scene index, or entity link; retrieval was similarity-only. |
| **(5) Adjudication/validation** | Partial — tool-call *syntax* was validated, but nothing checked whether narration *contradicted* canonical state, whether a roll was skipped, or whether numeric tool arguments respected declared bounds. |

On top of the missing Director layer, a first "does each layer exist"
audit pass was followed by a second, deeper pass that asked "does the code
that's supposed to enforce each layer actually run?" — and found several
places where it didn't. That second pass produced a punch list (C1–C5,
H1–H8, M1, M2) of concrete defects, most already fixed by the time this
document's later work began; the state after that first phase is the
"before" for everything described below.

## Phase 1 (prior to this session): closing the audit punch list

Quick reference — all of these were fixed before the work in this
document's Phase 2 started:

- **C1–C5 (Critical):** tool-arg numeric bounds now actually enforced;
  `game_over` requires a verifiable trigger instead of narrative say-so;
  combat HP clamped at 0 with auto-defeat, turn-ownership enforced; the
  Mythic chaos-factor mechanic reconciled to one live implementation
  (a dead, unrelated streak-heuristic version was deleted); dice formulas
  bounded against a DoS-shaped unbounded-roll input.
- **H1:** NPC attitude changes capped per call instead of able to flip a
  relationship from hostile to allied in one agreeable turn.
- **H2:** random events persist as tracked state until the GM explicitly
  resolves them, instead of a one-line hint easy to silently drop.
- **H3:** memory-compaction summaries validated against canonical state
  before being trusted (dropped-entity and status-contradiction checks).
- **H4:** a dead automatic-RAG code path deleted; semantic-search
  degradation ("configured but the call failed") made distinguishable from
  "genuinely found nothing," where before both collapsed to the same
  empty result.
- **H5:** partially corrected (a false "runs twice" claim retracted, real
  dead code deleted) — the core defect (tool args round-tripped through a
  string-serialize-then-regex-parse engine) was explicitly deferred to a
  later pass. See Phase 2.
- **H6:** flagged as needing a product decision (what should content
  safety mean for this app, and for whom) rather than solved unilaterally.
  Still unresolved by user choice — see "Deliberately not done," below.
- **H7:** self-declared "high"/"deadly" roll stakes made a mandatory
  reasoning-tier floor instead of decorative narration text.
- **H8:** roll modifiers cross-checked against structured character
  stats/resources when the model names which stat a bonus derives from
  (scoped: doesn't cover freeform/character-sheet-note-only adventures —
  see "Known accepted limitations," below).
- **M1:** a drifted duplicate random-event table deleted (it disagreed
  with the live one and nothing consumed it, but a future edit could have
  touched the wrong copy).
- **M2:** flagged as needing a product decision (should a roll always be
  required before a stated success/failure?) rather than solved
  unilaterally. Resolved in Phase 2 once that decision was made.

## Phase 2 (this session): the Director layer, and finishing what Phase 1 deferred

This is the "huge jump" — building the one layer that didn't exist at all,
hardening the one layer that was only partially enforced, and closing out
Phase 1's deliberately-deferred items once product decisions were made.

### Layer 3 (Director/Pacing) — built from nothing

| Before | After |
|---|---|
| No tension/pacing signal existed at all. | `AGMTState.tension` (0–10), updated at the same hook point as chaos factor — rises on combat, near-zero timers, chaotic scene checks; falls on calm scenes. |
| The GM had no bounded "move" concept — any pacing decision was implicit in whatever the model chose to narrate. | `selectDirectorMove` — a deterministic, model-independent policy choosing from a fixed PbtA-style menu (`announce_future_badness`, `tick_a_clock`, `put_someone_in_a_spot`, `spotlight_couch_player`). The model renders the chosen move as prose; it never picks which move fires — same anti-self-escalation principle as H7. |
| Countdown timers (`manage_timer`) existed but had no connection to story threads. | `StoryThread.linkedTimerId`/`threshold` — a Blades in the Dark-style "Front" wrapper; a timer nearing zero surfaces its linked thread to the GM without silently mutating thread status itself. |
| Couch co-op ("pass-and-play") multiplayer existed, but nothing tracked whose turn it had been. | Each turn now records `ScenePart.speakerIds`; `StoryData.multiplayer.couchPlayerFocus` tracks turns-since-spoken per player; `selectDirectorMove` spotlights whoever's gone longest unheard. |
| No concept of player preference existed. | A lightweight, PaSSAGE-inspired player-style model: player input classified by keyword (action/social/tactical — same class of lightweight heuristic already used elsewhere in this codebase) and accumulated per player. Used only to break close spotlight-selection *ties* — it never overrides basic fairness of screen time. |
| `character_sheet`-type lore entries were already structurally repeatable (the prompt builders injected *all* of them) but nothing linked a specific sheet to a specific player. | `StoryLore.ownerCouchPlayerId` closes that link. |

### Layer 5 (Adjudication) — from "ask nicely" to "verify"

| Before | After |
|---|---|
| Nothing checked whether narration contradicted canonical state — the system prompt just asked the model to self-verify consistency. | `checkNarrationConsistency` (mirrors the H3 compaction-validator pattern): flags a dead/departed NPC narrated with an active-presence phrase. Deliberately narrow — no inventory checks (removed, see below), no general prose grading. Non-blocking by design (narration streams before a full-text check could run); recorded on `ScenePart.consistencyWarnings`. |
| Nothing stopped the GM stage from completing a turn with zero tool calls even during combat, a challenge, or after declaring high/deadly stakes — a stated success/failure could bypass the oracle layer entirely. | The M2 roll-invariant gate: a gated scene ending with no roll/oracle tool call forces a re-prompt round (capped, fails open) — and forces `tool_choice: "required"` on that specific retry, not just a prose request. |
| Tool-call arguments got flattened back into pipe-delimited command strings and re-parsed by regex (H5's deferred defect) — and two tools (`delete_quest`, `delete_note`) built command strings with **no matching regex handler at all**, silently failing every call despite being in the live tool whitelist. | 13 tools now dispatch directly via typed functions, no string round-trip. `delete_quest`/`delete_note` got real implementations for the first time — this was a live, previously-undiscovered production bug. |
| A known DeepSeek reliability issue (a tool call sometimes arrives as text in `content` instead of populating `tool_calls`) had no handling anywhere. | Defensive fallback parsing recovers a tool call from `content` when it's tool-call-shaped JSON, in both API routes. |

### Layer 4 (Memory) — from flat retrieval to structured signals

| Before | After |
|---|---|
| `MemoryEntry` was `{content, embedded?}` — no way to rank by recency or relevance to specific entities. | `MemoryEntry` also carries `timestamp`, `sceneIndex`, `entityIds` (exact-matched against tracked NPCs/threads), and an optional GM-self-rated `importance`. |
| Semantic memory search ranked purely by embedding similarity. | Reranked by a bounded recency/importance/entity-relevance boost on top of similarity — a lightweight version of the Generative Agents memory-scoring pattern, using similarity as the "relevance" axis directly. |

### State/structure cleanup

- **Inventory deprecated.** The structured `InventoryItem[]`/8 item tools
  turned out not to be dead (the opposite of what was assumed going in) —
  they were fully live via manual UI/commands, just unreachable by the AI
  GM specifically (a whitelist gap, same bug class as the pre-existing
  `increment_scene` issue H2 already fixed once). Rather than fix that
  reachability gap, inventory was folded out entirely into the same
  freeform character-sheet-note convention Stats/Resources already use,
  per an explicit product decision. Along the way, a **1,100-line fully
  dead function** (`processCommands` in `page.tsx`, zero production
  callers) was found and deleted, and false "your stories are encrypted,
  we can't read them" claims were found and corrected in two internal docs
  and the public privacy policy — the encryption feature they described
  had never actually been implemented.

### Testing

Every mechanism above that wasn't trivially unit-testable got real
integration coverage, not just pure-function tests: `tests/helpers/
mockGMFetch.ts` is new infrastructure that scripts the GM stage's
streaming responses and drives `generateStoryTurn` for real. Every
non-obvious test in this phase was verified by deliberately breaking the
mechanism it covers and confirming the test actually fails, then restoring
the code — including a full 7-turn scripted-campaign regression test
proving contradiction detection doesn't degrade as a session gets longer.
Test count grew from roughly 550 to 644 over the course of this phase.

## Phase 3 (later session): an architecture re-audit, active adjudication, and a memory agent

A follow-up pass re-verified this document's and `architecture-frontier.md`'s
claims directly against the code (some had drifted — see the corrections
in `architecture-frontier.md`) and used the findings to drive a further
round of changes, split across Layers 2, 4, and 5.

### Layer 5 (Adjudication) — from diagnostic to active, and widened

`checkNarrationConsistency` is unchanged and still diagnostic-only. New
alongside it: **`observer.ts`**, the first *active* adjudication mechanism —
it can roll `StoryData` back to a pre-turn snapshot and force a retry, not
just record a warning after the fact. `architecture-frontier.md` had
explicitly left this kind of move as an open, undecided question ("worth
reconsidering only if warnings start firing often enough in practice"); this
phase made that call. Five checks, two severities:

- **Major (can trigger a reset-and-retry, capped, fails open — same posture
  as the M2 gate):** a response-length blowout past the Reply Length
  setting's ceiling; a player-agency violation (the GM deciding what the
  player character says/thinks/does, an LLM-judged check against the
  existing "PLAYER AGENCY (NON-NEGOTIABLE)" prompt rule); and an
  **outcome/narration mismatch** — an LLM-judged check for whether the
  finished narration contradicts the mechanical `SUCCESS`/`FAILURE` result
  of the last roll made that turn. The roll result being ground truth
  narration can't override is the core "LLM proposes, deterministic engine
  disposes" thesis this whole app is built on — this is the first place
  that's checked directly rather than just hoped for.
- **Minor (log-only, surfaced as a warning, never triggers a reset — neither
  rule was ever stated to the GM as a hard requirement the way PLAYER
  AGENCY was):** two tool-usage-gap checks — narration that invented an
  uncertain outcome instead of consulting `fate_question`/`roll_table`, and
  narration that described a scene transition without calling
  `increment_scene`.

### Layer 4 (Memory) — a dedicated write-side agent, and reflection made visible

- **A dedicated memory agent (`memoryAgent.ts`)** now decides what from each
  turn is worth persisting to `storyData.memory`, running once per accepted
  turn (after `observer.ts` has settled on a final result, so memory is
  never written about narration that gets reset). `add_memory` was removed
  from the GM's own live tool set — the GM no longer makes this judgment
  call mid-generation at all. Retrieval is unchanged: the GM still calls
  `search_memory` on demand, preserving the existing "agentic retrieval, not
  automatic pre-fetch" decision.
- **Reflection insights are now guarantee-surfaced.** This closes
  `architecture-frontier.md`'s Frontier 2, item 1, which had flagged that a
  `reflection.ts` insight could be synthesized (spending a real API call)
  and then never seen for the rest of the campaign if the model never
  happened to search for the right query. `formatMemorySection` (shared by
  the GM-stage and Choices-stage prompts) now injects the most recent
  reflection entries unconditionally, the same treatment `character_sheet`
  lore already gets, alongside the existing entry count.

### Layer 2 (Oracle/Entropy) — challenge-system bugs, and a reopened DoS gap closed twice

Four defects found by re-reading this layer's code directly rather than
trusting its "mostly solid" reputation:

- **A challenge could get stuck active forever.** The live (model-reachable)
  challenge tool set had no cancel path — if a challenge stopped mattering
  narratively before either side reached its threshold, it stayed active
  indefinitely, blocking both new challenges and resting. Added
  `cancel_challenge` to the live tool set.
- **Asymmetric challenge thresholds were silently collapsed to symmetric.**
  `start_challenge`'s declared `required_successes`/`max_failures` were
  discarded in favor of one majority number derived from `rounds`; a
  deliberately lenient/harsh asymmetric declaration got the wrong threshold
  on one side. Both are now stored and honored independently (with a
  fallback to the old derived-majority behavior for challenges already
  in-flight from before this fix).
- **`formula_challenge_check` brought to parity** with
  `formula_roll`/`opposed_formula`: `reverse_dc`, `stakes` escalation
  (feeding the same reasoning-tier floor and M2-gate signal), the
  `target`/`forces_choice` hardness dimensions, and stat-integrity checking
  all now apply to challenge checks too — previously missing entirely,
  despite challenges being reserved for the biggest scenes by the tool's own
  description.
- **A DoS-shaped unbounded-dice-roll gap, reopened through a second path,
  closed in two places.** The changelog above credits `diceFormula.ts`'s
  `MAX_DICE_COUNT`/`MAX_DICE_SIDES` bound with closing this defect class —
  but two other, independent dice-rolling code paths bypassed
  `diceFormula.ts` entirely and had no cap at all: `page.tsx`'s
  "context roll" flavor-dice parser (fed by the `analyzeAction` pre-pass),
  and the `calculate` GM tool's own embedded `NdM` parser (fed directly by
  the model's `expression` param — the more exposed of the two). Both now
  enforce the same bound.

### Cleanup

- **`GMProgressPanel.tsx` deleted.** It was fully built (a collapsible tool-
  call checklist) but never imported anywhere — confirmed dead by grep, and
  confirmed *why* it stayed dead: `story.tsx`'s `TimelineEntryPill`/
  `TimelineView` already renders an unconditional, always-visible per-step
  checklist (check/X icons, expandable `contextForStory`) inline in every AI
  message, built later and fully superseding it. Wiring the old component in
  would have just duplicated that UI.

### New known gap (found, not yet closed)

- **`ask_question` doesn't feed couch-coop spotlight tracking.** The
  recently-added `ask_question` tool can target a specific player, but
  that's cosmetic only — answering a targeted question doesn't reset that
  player's neglect counter (`couchPlayerFocus`) or contribute to the
  PaSSAGE-style play-style classifier the way every other form of player
  input does. Not fixed in this phase — flagged for a future one.

## Phase 4 (later session): the observer learns who the player character is

Three related complaints about Layer 5 in practice — the observer flagging
turns that were long for a reason, mis-attributing dialogue, and having no
appeal — plus the GM-side cause of the second one.

### Layer 5 (Adjudication) — scoped, informed, and reversible

- **Setup is never judged** (`observerSuspensionReason`). While the GM is
  interviewing the player, writing the character sheet / mechanics / campaign
  plan, and narrating an opening, it legitimately runs far past any
  reply-length band and legitimately proposes things about the player
  character. Every check there was a false positive waiting to happen, and the
  correction it triggered damaged the one turn the whole campaign is built on.
  Three signals, because no one of them covers every way a story starts:
  `sessionZeroActive`; a `start_game` call this turn (the flag flips false
  mid-turn when the tool executes, so `generateStoryTurn` reads it off the
  **pre-turn snapshot** and checks tool names too — otherwise the wrap-up turn
  would be the single part of session zero that still got judged); and the
  absence of a `character_sheet` note, which is the same condition
  `buildGMStagePrompt` uses for its "FRESH STORY — SETUP NEEDED" block and the
  only thing covering adventure-started stories (`startAdventureLocally` never
  sets `sessionZeroActive`) mid character creation. Suspension skips the
  blocking *and* background passes, so it costs no API calls.
- **The judges are told who the player character is**
  (`buildObserverCharacterContext` / `formatCharacterContextBlock`). Every
  LLM-backed check previously saw exactly two things: the player's declared
  action and the narration. `checkPlayerAgencyViolation`'s entire verdict
  rests on telling the player character apart from an NPC, which that input
  cannot support — in practice it both excused real violations ("that was
  just a character talking") and invented false ones from NPC dialogue. The
  judges now get the PC's name, summary, sheet, and the known NPC roster, and
  the agency prompt makes the who-is-who call an explicit first step. The
  same context goes to `rewriteFlaggedNarration`, so corrections keep the
  cast straight too.
- **The length judge got sharper criteria and the turn's mechanical
  results.** The justification pass added after Phase 3 now enumerates what earns extra
  words — setup, an out-of-character rules/mechanics answer, a major reveal,
  several rolls resolving at once, a requested time skip — against what
  doesn't (padding, restating a beat, narrating past the player's turn), and
  sees `gmStoryContext` so a turn narrating five roll results isn't judged
  against the same yardstick as one narrating a single line of dialogue.
- **Rewrites are grounded in the turn they're rewriting.**
  `rewriteFlaggedNarration` used to be a standalone two-message prompt holding
  the player's action, the flagged text, and the roll results — no premise, no
  scene history, no notes, no character sheet. It was being asked to rewrite
  prose for a story it could not see, and it showed: rewrites came back
  reading like they belonged to a different game. It now **continues the
  turn's own conversation** (`GenerationResult.gmPromptMessages`, the same
  base-messages-plus-history array the story stage continues via
  `buildStoryContinuationPrompt`), with the correction appended as the final
  user turn, and the instruction pins it to the same moment: same scene, same
  events, same outcome, no advancing the story, no new characters or places.
  The old standalone prompt survives as the fallback when no conversation is
  available.
- **Rewrites are reversible** (`ScenePart.observerRewriteOriginal`). The
  observer is a judge, not an oracle: a turn it cut for length may have been
  the long explanation the player wanted. The discarded draft — prose, the
  choices parsed from it, and the GM history as it stood before
  `reconcileGmConversationAfterRewrite` — is stored on the scene part, and the
  **existing Undo button** puts all three back: Undo peels off the revision
  first, and a second press undoes the whole turn the normal way. (No separate
  button — Undo already means "walk back the most recent change".) Restoring
  clears `correctedObserverFlags`, so the next turn's prompt doesn't scold the
  GM for prose that is back in play; editing the turn by hand clears the
  stored original for the same reason.

### GM prompt — the character sheet as live input, not an opening handout

`buildGMStagePrompt`'s state message never contained `player_name`,
`player_summary`, or the profile tags picked at story start: the GM stage —
the layer that decides rolls, NPC reactions, and what the world does — knew
the player character only through whatever the `character_sheet` note spelled
out, and the curated personality/wish tags were durable state read *only* by
the director layer's `spotlight_tag` move. That is why the GM drifted off the
player's chosen traits after the opening scene. A `PLAYER CHARACTER` block now
leads the state message (name, summary, couch roster, personality tags, wish
tags), the character-sheet header asks for the sheet to decide something
concrete every turn rather than be read once, and the PLAYER AGENCY rules
point at the block by name so "who am I not allowed to speak for" is stated,
not inferred.

## Phase 5 (later session): the observer stops making the player wait

Layer 5's correctness was fine; its *cost in wall-clock time* was not. On a
turn flagged for length, everything between "narration finished streaming" and
"choices appear" was serial: five observer checks one after another, then the
rewrite, then a choices regeneration — up to seven sequential round trips the
player sat through. Nothing here changes a single verdict; it changes when the
calls happen.

### Layer 5 (Adjudication) — the same corrections, overlapped

- **The checks run concurrently** (`runObserver`). The five are fully
  independent — each reads only the finished turn and its own settings, none
  mutates anything, each already fails open on its own — so awaiting them in
  sequence only ever bought latency. They're a `Promise.all` now, with flags
  still collected in the same fixed order (length, agency, outcome,
  tool-usage, tier), because `generateStoryTurn` corrects the *first* major
  flag and that choice must not become a race between judges.
- **The shortened rewrite starts before the verdict is in** (the speculative
  rewrite in `generateStoryTurn`). `checkResponseLength` has two halves: a
  free, deterministic word-count trip, and an LLM justification judge that
  decides whether the overage was *earned*. The flag's text depends only on
  the first half — so the moment the counter trips, the app already knows
  exactly what a length rewrite would be asked to do, and the only open
  question is whether it will be wanted. That half is now split out as
  `prospectiveLengthFlag`, and the rewrite is fired immediately, concurrently
  with the observer:
  - judge says **unjustified** → the flag is real and the shortened version is
    already in flight; it's awaited instead of started, so the rewrite's
    latency hides entirely behind the judge's.
  - judge says **justified**, or a different major flag wins → the speculation
    is aborted and discarded, and the original narration stands exactly as it
    would have before.

  Gated on a rewrite being reachable at all (the check enabled and
  reset-eligible, the reset budget unspent), so a speculation is never fired
  for a correction that could not happen. The accepted cost is one wasted
  ~400-token call on turns the judge ends up justifying; the default ceiling
  is already 2× the band's high, so most trips are genuine.
- **A speculative rewrite carries the other reviewers' complaints
  conditionally** (`RewriteNarrationParams.alsoFixIfPresent`). A turn gets one
  rewrite (`MAX_OBSERVER_RESETS`), and the speculation starts before the other
  judges have answered — so it's told what they look for, phrased as "fix this
  too, *if* it's genuinely true here, and do not invent a problem to fix".
  Only the text-based checks get a clause (`player_agency`,
  `outcome_narration_mismatch`); the tool-usage and tier checks are complaints
  about tool calls and reasoning tier, which no amount of rewriting the prose
  addresses. Nothing re-judges the corrected text, so a preventive clause is
  never treated as proof of a fix: any flag the other judges *do* raise is
  still attached to the turn.

## Phase 6 (later session): the dice tools stop judging

Layer 2 (entropy/oracle) and layer 5 (adjudication) had been fused together
inside the dice tools: `formula_roll`, `opposed_formula`,
`formula_challenge_check`, `ask_for_roll` and `npc_roll` each rolled dice
*and* compared the result against their own `dc` parameter, returning a
SUCCESS/FAILURE verdict. That looked like good "engine disposes" design, and
for D&D-shaped systems it was. It also quietly assumed that every system
resolves a roll by beating one target number.

Real play found the seam. Running Starforged - a 1d6 action die plus modifiers
against two d10 challenge dice - the GM reached for `opposed_formula` and got
back a "winner", because the tool's only vocabulary for two dice pools was
"higher total wins". Roll-under systems needed a dedicated `reverse_dc` flag
to say something plain arithmetic says on its own. Systems with degrees of
success (beat both dice, beat one, beat neither) had no way to be expressed at
all.

**The split.** Rolling and adjudicating are now separate calls:

- The dice tools report numbers and nothing else. No tool takes a `dc`; none
  of them returns a verdict. `formula_roll`'s `success` means "the dice were
  thrown".
- `calculate` gained comparisons: `'17+3 >= 15'` returns TRUE/FALSE, and its
  `success` carries that verdict (joining `DICE_TOOLS` in `generation.ts`, the
  list of tools where `success: false` is a game outcome rather than an
  error). Every check is now at least two calls.
- `check_dc` was deleted - a second way to ask what `calculate` now answers.
- `formula_challenge_check` became `record_challenge_result({ outcome })`,
  which rolls nothing and banks a verdict the GM has already computed. A
  challenge check is `formula_roll` → `calculate` → `record_challenge_result`.
- Anything conditioned on pass/fail - per-outcome `consequences`, the
  `target`/`forces_choice` hardness dimensions - is echoed back for *both*
  branches, phrased conditionally ("[If this failed: ...]"), since the engine
  genuinely no longer knows which one landed.

This moves adjudication authority from the tool's hardcoded `>=` to the
adventure's `mechanics` note, without moving it into the model's prose: the
comparison is still deterministic code the model can't fudge, it just has to
say out loud which comparison it wants. The M2 roll-invariant gate still keys
on the *dice* tools (rolling, not bookkeeping), so a gated scene can't be
resolved by adjudicating nothing.

**One knock-on worth recording.** The observer's
`outcome_narration_mismatch` judge compared narration against a roll's
`success`. With the dice tools always reporting `success: true`, feeding them
to that judge would have flagged every legitimately-failed roll as a
contradiction. It now watches `calculate` and `record_challenge_result` - the
two tools whose `success` is a real verdict.

**Independent pools, and one handful of dice.** `formula_roll` takes
`formulas: string[]`, one entry per independent pool, each with its own total
and nothing summed across them - so `["1d6+2", "2d10"]` reports three dice
and two totals, and the GM makes one `calculate` call per challenge die. The
batched `DiceResolver` in `diceFormula.ts` collects every group across every
formula before any dice are thrown, which also fixed a physical-dice bug that
predated this work: `2d6+1d4` used to open the 3D tray twice, once per dice
group, because the resolver was called per group. All of a roll's dice now
leave the hand together, the way they do at a table.

**Manual dice mode stopped parsing.** `ask_for_roll` used to run the player's
typed or spoken answer through an `extractRollNumber()` helper that took the
*first* number in the text. For a single d20 total that worked; for "4, 6" -
two challenge dice - it silently reported 4. The answer now reaches the GM as
verbatim text, and the GM reads it against what it asked for. The client no
longer validates the answer at all, since it has no idea what shape a valid
answer has.

## Deliberately not done

- **H6 (content-safety layer):** explicitly skipped by product decision —
  what content safety should mean for this app, and for whom, is a
  decision for the product owner, not something to invent unilaterally.
- **Event-sourced state storage:** a second paper's suggestion; see
  `docs/event-sourcing-alternative.md` for the full reasoning. Short
  version: a large, high-risk storage rewrite for benefits (audit trail,
  time travel) nothing in the app currently needs, and it contradicts this
  codebase's consistent "extend, don't replace" precedent.
- **Migrating to the Vercel AI SDK / `generateObject`:** the same second
  paper's suggestion. This app's existing tool-calling + schema validation
  already accomplishes what that migration would provide; swapping the
  underlying request/response framework was judged higher risk than value
  given everything else already works.
- **A broader campaign-length regression eval harness beyond the one
  scripted-campaign test:** the paper's Phase 4 also envisioned things like
  an imposed-failure-rate sanity metric across many simulated sessions;
  only a first, real instance of that pattern was built, not a full suite.

## Known accepted limitations (pre-existing, not addressed by this work)

- **H8's residual gap:** roll-integrity checking only works for adventures
  that populate structured `stats`/`resources`. Adventures using a
  freeform character-sheet note (the app's own documented, preferred
  convention) have no reliable way to be checked without guessing numbers
  out of prose — deliberately left unclosed rather than papered over with
  an unreliable heuristic.
