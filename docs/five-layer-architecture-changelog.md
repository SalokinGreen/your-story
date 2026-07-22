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
