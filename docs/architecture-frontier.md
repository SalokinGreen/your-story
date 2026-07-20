# The Architecture's Frontier: Where to Strengthen This Further

## Purpose and scope

`docs/five-layer-architecture-changelog.md` is the retrospective record - what
the five-layer papers changed, and what it looked like before. This document
is the prospective companion: given everything that's actually been built
(two full phases, most recently memory reflection, director macro-arc
pacing, a widened leniency audit, multi-character-sheet ownership, and a
second player-style signal), where does the *research* - and the honest
experience of having now implemented most of it - say to go next?

Everything below is graded for effort and risk, and ordered by layer. None
of it is a commitment or a plan someone approved; it's a map of the
remaining terrain, written so a future decision to build (or not build) any
of it starts from an accurate picture instead of re-deriving one from
scratch. Two adjacent documents are treated as settled rather than repeated
here: `docs/event-sourcing-alternative.md` (storage architecture - declined,
with reconsideration criteria) and the content-safety and freeform-stats
gaps flagged as open product decisions in the changelog. This document adds
one new angle on the storage question (a hybrid, see Frontier 8) and
otherwise defers to that doc rather than re-litigating it.

## Orientation: what's already true today

Quick anchor, not a restatement - see the changelog for the full picture:

- **State, oracle, adjudication**: solid, tool-call-mediated, validated.
- **Director/pacing**: tension scalar, a 4-move bounded menu
  (`announce_future_badness`, `tick_a_clock`, `put_someone_in_a_spot`,
  `spotlight_couch_player`), a Freytag-shaped macro-arc target
  (`storyProgress`/`targetTensionForProgress` in `mythic.ts`) the director
  compares live tension against, couch-player spotlight fairness with a
  style-based tiebreaker.
- **Memory**: `MemoryEntry` carries timestamp/sceneIndex/entityIds/importance;
  semantic search reranks by a bounded recency/importance/entity boost;
  `reflection.ts` periodically synthesizes higher-level insights from memory
  clusters once cumulative importance crosses a threshold (Generative
  Agents' actual differentiator, not just its scoring formula).
- **Multiplayer**: couch co-op (same-device, named speaker bubbles),
  spotlight-neglect tracking, a lightweight PaSSAGE-style player model fed
  by *two* independent signals (freeform-text keywords and actual GM
  tool-call activity), and `StoryLore.ownerCouchPlayerId` linking a
  `character_sheet` entry to a specific player.
- **Testing**: a leniency-audit log widened past the M2 hard gate, litmus-
  checked coverage for every non-obvious mechanism above.

## Frontier 1: NPCs as their own agents, not attribute bags

This is the single largest unrealized idea in the source research, and it's
worth being precise about *why* it's still open: Generative Agents' (Park et
al.) actual contribution isn't the recency/importance/relevance scoring
formula - that part is already adopted (`entityIds`/`importance`/semantic
reranking). The paper's real claim is that each simulated character is its
own small agent: a private memory stream, reflections about *its own*
experience, and forward planning that executes autonomously and gets
observed by other agents - which is what produces believable, continuous-
feeling characters instead of characters who only exist in the instant the
player is looking at them.

Today's `NPC` interface (`structs.ts`) is a flat attribute bag - `status`,
`attitude`, a freeform `relationship` string, `faction`, `notes` - fully
re-narrated fresh every turn by the one GM model. There's no Marcus-side
memory stream, no Marcus-side reflection, no Marcus-side plan. Everything
that makes Marcus feel continuous currently lives entirely in the GM's
short-term prompt context and the shared, player-facing memory pool.

**What this would look like, adapted to a turn-based single-model
architecture** - explicitly *not* a recommendation to run N autonomous
background agent loops (that's the literal Stanford-paper architecture,
built for a persistent simulated town nobody is actively steering; this app
has one player steering one story, and the model stays the single author of
what actually happens - the same "LLM proposes, deterministic engine
disposes" thesis every other layer already follows):

1. **A `goal`/`currentIntent` field on `NPC`** (freeform text, GM-authored,
   same convention as the freeform character-sheet-note approach already
   used for stats) that persists across turns even while the NPC is
   off-screen - "Marcus is trying to secure a trade deal with the Duke
   before the harvest festival." Gives the model a small persistent north
   star instead of reinventing an NPC's motivation every time they
   reappear, and makes "while you were gone, Marcus..." narration
   plausible instead of invented on the spot.
2. **NPC-scoped reflection**: `reflection.ts`'s synthesis pass, re-scoped
   per-entity. Once enough `entityIds`-tagged memory accumulates for a
   given NPC, run the same synthesis prompt filtered to that NPC's
   memories, producing an NPC-specific insight ("Marcus no longer trusts
   the player after the warehouse incident") that surfaces the next time
   that NPC is in scene. This is the lowest-risk, most direct extension
   here - it reuses shipped machinery (`planReflection`/`applyReflection`/
   `ensureStoryReflected`) with a filter, not new infrastructure.
3. **A private NPC memory write path** (a new tool, e.g. `add_npc_memory`,
   mirroring `add_memory`'s shape) for facts the model wants attributed to
   what a *specific NPC* knows or witnessed, as distinct from what's
   generally true of the story. Only worth building after (1) and (2) prove
   out - it's the highest-effort piece of this frontier and the one most
   likely to just duplicate the existing memory pool if not scoped
   carefully.

**Effort/risk**: (1) and (2) are medium effort - additive struct fields plus
prompt-builder wiring plus a filtered reflection call - and low
architectural risk, since both extend existing patterns rather than
replacing anything. The real risk is product judgment, not engineering: an
NPC with a persistent "want" needs the *same* "engine decides when it
surfaces, model narrates it" discipline that H7 already had to establish for
reasoning-tier escalation and that `selectDirectorMove` already enforces for
pacing moves - otherwise it's a new, ungated place for the model to invent
consequences. Don't ship NPC goals without deciding, explicitly, when and
how they're allowed to affect state.

## Frontier 2: reflection's next layer - insights that get *retrieved*, not just stored

Reflection is real now, but its output enters the exact same pool as every
other memory, gated behind the model choosing to call `search_memory` with a
query that happens to match. Nothing about `ai_staged.ts`'s prompt
construction treats a reflection entry (`isReflection: true`) as more
important to surface than an ordinary fact - the info message only ever
shows a memory *count* ("🧠 Memory (N entries) - use search_memory to find
specific facts"), never memory content directly. A synthesized insight the
system just spent an API call producing can sit unseen for the rest of the
campaign if the model never happens to search for it.

Two concrete next steps, ordered by risk:

1. **Guarantee-surface the N most recent (or highest-importance) reflection
   entries** directly in `buildInfoMessage`'s summary section - the same
   "unconditionally injected, not trigger-gated" treatment `character_sheet`
   lore already gets, for the same reason (this is exactly the kind of
   thing that should never depend on the model guessing the right search
   query). Low risk, small, boundable prompt-budget cost, and it directly
   closes a real gap in a mechanism that was *just* built.
2. **A second-order reflection pass** (reflections about reflections, once
   enough reflection entries accumulate) - Generative Agents' actual
   "reflection tree," where higher-level insights can themselves become
   source material for still-higher-level ones. This is real prior art, but
   genuine scope creep for this app right now. Only worth it if, after (1)
   ships and reflection insights are actually being seen by the model in
   practice, single-pass reflection is observed producing shallow or
   repetitive output. Don't build ahead of that observation.

## Frontier 3: director layer - from one curve to nested arcs, plus a dashboard

`targetTensionForProgress` treats an entire campaign as one Freytag arc.
Real serialized fiction - and real tabletop campaigns - nest arcs: each
chapter or session has its own small rise-and-fall inside the larger one. A
whole-campaign-only curve means a legitimately calm resolution scene in
chapter 3 of 10 can register as "behind the arc" purely because the overall
campaign is still in its rising action, which isn't actually a pacing
problem.

- **Per-chapter tension targets**: compute progress within the current
  chapter (`currentChapter`'s own local position, not just
  `currentChapter / max_chapters`) and blend it with the campaign-wide
  target rather than replacing it - a calm beat can be locally correct even
  while the campaign macro-arc is elsewhere. Moderate effort (new progress
  function, careful blending so it doesn't just replace the existing
  signal), low risk.
- **A pacing dashboard, for humans, not the model**: `agmtState.tension`,
  the macro-arc target, and `pendingDirectorMoves` history already exist as
  state - none of it is currently visible anywhere except through gameplay
  effects. A simple sparkline in the existing AI Config/debug panel (tension
  vs. target over scene count) would give a creator debugging "this
  campaign feels flat" an actual signal instead of vibes. This is the
  cheapest, safest item in this entire document - it's a read-only view of
  state that already exists, with zero model-facing changes.
- **Expanding the GM-move menu**: PbtA's own move vocabulary is much larger
  than what's implemented, though the menu has grown past the original 4
  (`announce_future_badness`, `tick_a_clock`, `put_someone_in_a_spot`,
  `spotlight_couch_player`):
  - `offer_opportunity` - a non-escalating soft move that fires as the
    fallback for an otherwise-calm, on-pace scene with an open thread to
    hang the opportunity on, replacing what used to just be `null`.
  - `reveal_unwelcome_truth` - fires when a `StoryLore` entry is queued
    for reveal (`visibility: "to_be_revealed"`, part of the existing
    Two-Pass Visibility system) and nothing more urgent is happening;
    checked before `offer_opportunity` in the same calm-scene fallback,
    so a pending secret backlog takes priority over pure flavor. The
    model still does the actual reveal (prose + flipping visibility via
    `edit_lore`); this only supplies deterministic timing.

  "Show a downside of their gear/ability" was tried (`activate_downside`,
  keyed off a tracked `Ability`'s cost/cooldown) and reverted: `Ability[]`
  is itself soft-deprecated (`buildInfoMessage` in `ai_staged.ts` already
  says "Stats, resources, abilities, and rpgSystem are DEPRECATED - all
  mechanics are now defined in mechanics-type lore entries," and the
  creator AI hasn't populated structured abilities for new adventures in a
  long time) - `docs/game-mechanics.md` is stale on this point and should
  be corrected. A move keyed off data new adventures increasingly won't
  have is the same failure class as building on the old dead
  `currentCooldown` field, just at the level of the whole mechanism; it
  needs a different, non-deprecated structured hook (or none) before
  trying again. Remaining unimplemented from PbtA's broader vocabulary:
  separating the characters, capturing someone, trading harm for harm,
  turning a player's move back on them, and others. Mechanically cheap to
  add (an enum entry plus a branch in `selectDirectorMove`), but each new
  move needs its own trigger condition reasoned through with the same care
  the existing ones got - do this one move at a time with real
  playtesting in between, not
  as a batch.

## Frontier 4: adjudication - beyond NPC-status contradictions

`checkNarrationConsistency` (C2) deliberately covers exactly one
contradiction class: a dead/departed NPC narrated with an active-presence
phrase. Two honest directions from here:

- **Widen entity coverage** using the identical pattern (exact name/title
  match + a small active-presence-phrase window, reusing
  `compaction.ts`'s exported `escapeRegExp`/`countNameMentions`/
  `ACTIVE_PRESENCE_PHRASES`): a `StoryThread` marked `resolved`/`abandoned`
  narrated as still open, or a `Condition` that's been removed narrated as
  still active. Same low-risk, narrow, deterministic shape - just more
  `TrackedEntity` kinds, not a new mechanism.
- **The streaming-vs-blocking tradeoff remains genuinely unsolved.**
  Narration streams token-by-token before the checker can run, so a
  contradiction warning is always after-the-fact - it can flag, never
  prevent. The real fix (buffer narration, check, then release) is a
  legitimate UX regression (added perceived latency) for a benefit that's
  so far been purely diagnostic. Worth reconsidering only if warnings start
  firing often enough in practice that "the player already read the
  contradiction" becomes a recurring, demonstrated complaint - not
  preemptively.

## Frontier 5: an eval harness at real scale

The changelog already names this as "deliberately not done": one scripted
7-turn campaign regression test exists (`tests/generation.
campaignRegression.test.ts`); the source papers' own Phase 4 envisioned an
*imposed-failure-rate* sanity metric across many simulated sessions -
statistically, does a gated scene resolve as a stated failure roughly as
often as the dice math predicts, or does something in the pipeline
systematically launder failures into narrated successes? Building this for
real means:

- A corpus of scripted scenarios (not one campaign) spanning combat,
  challenge, high-stakes, and social scenes, each seeded with a fixed
  `Math.random` sequence (this codebase's established determinism
  convention) so the *expected* failure rate is computable exactly, not
  estimated.
- Running the full corpus and computing observed-vs-expected failure rate
  as an actual number a CI check can assert against, not a pass/fail eyeball.

This is real infrastructure investment - budget it the same way F2/F3 were
budgeted in the original plan, as a dedicated unit, not a fold-in. It's also
worth sequencing *before* any future RAG or prompt-tuning change ships,
since without this metric there's no way to tell whether such a change
quietly shifted the imposed-failure-rate one way or the other.

## Frontier 6: multiplayer beyond couch co-op

Current multiplayer is same-device pass-and-play with named speaker
bubbles, and it just got meaningfully deeper this session (spotlight
tracking, a two-signal style model, multi-character-sheet ownership). Two
structurally different directions exist beyond it - and they are not the
same project, so they shouldn't be planned as one:

- **Per-PC mechanical independence**: each couch player gets their *own*
  stats/resources/abilities instead of sharing one `character_sheet`. This
  is a data-model change (`Stat`/`Resource`/`Ability` arrays would each
  need an owner-player link, mirroring what `StoryLore` just got) -
  moderate effort, no storage-architecture change required.
- **Genuinely networked, concurrent multiplayer** (multiple devices, real
  time). This is the one place `docs/event-sourcing-alternative.md`'s
  reconsideration criteria actually trigger - "multi-writer conflict
  resolution," explicitly named in that doc's "when this would become worth
  reconsidering" list. Do not attempt concurrent multiplayer on the current
  single-JSONB-blob, last-write-wins model; if this is ever pursued, event
  sourcing is a prerequisite, not a parallel effort - in that order.

## Frontier 7: still open by explicit product decision, not oversight

Restated here only so neither gets lost in a "what's left" reading of this
document:

- **H6 (content-safety layer)** - both prior phases left this unsolved on
  purpose. It needs a product decision (what should content safety mean for
  this app, and for whom) before any engineering starts, not a unilateral
  technical answer.
- **H8's residual gap** - roll-integrity checking only works for adventures
  that populate structured `stats`/`resources`. Freeform character-sheet-
  note adventures (this app's own preferred, documented convention) have no
  reliable way to be checked without guessing numbers out of prose. Still no
  good answer here; still flagged rather than papered over.

## Frontier 8: storage architecture - one new nuance on an unchanged recommendation

`docs/event-sourcing-alternative.md`'s conclusion stands: a full
event-sourced rewrite remains correctly declined for the reasons that doc
lays out, and nothing here changes that. One addition worth recording for
the future: a **hybrid** version exists between "nothing" and "rewrite every
write path." Keep the current JSONB blob as the sole source of truth for
gameplay (completely unchanged - nothing reads state *from* the log, so no
projection layer is needed, which is the majority of that doc's cost
section), and additionally append a narrow, purely observational event log
covering only the handful of things that already produce "what changed and
when" signal today: consistency-checker warnings, leniency-audit log
entries, and reflection passes. This buys a slice of the original doc's
"real audit trail" benefit at a fraction of the cost specifically *because*
it's bolt-on and read-only from the game's perspective - a debugging tool,
not a new authority. Worth scoping only if a real, demonstrated debugging
need surfaces (e.g., "why did this story's chaos factor look wrong at scene
40" becomes a recurring support question) - speculative otherwise, same
"don't build ahead of a demonstrated need" posture as everything else in
this document.

## Cross-cutting concern: prompt budget

Every recommendation above that adds more *always-surfaced* context
(guaranteed reflection insights, chapter-scoped tension text, an expanded
GM-move menu) competes for the same GM Stage context budget
(`customMaxContext`) that memory/lore/mechanics content already competes
for. None of this is free just because it's deterministic and cheap to
*compute* - the cost that matters here is prompt tokens, not CPU cycles.
Before shipping Frontier 2's "guarantee-surface top-N reflections"
specifically, measure what it actually costs against typical
`customMaxContext` settings, the same way H4's original fix cared about
degrading gracefully instead of silently consuming the whole budget.

## If you only do three things next

Ranked by (value ÷ (effort × risk)), given everything above:

1. **Guarantee-surface reflection insights** (Frontier 2, item 1). Small,
   safe, and closes a real gap in a mechanism that was *just* built - right
   now it risks being invisible in practice without this.
2. **Per-chapter tension target + a read-only pacing dashboard**
   (Frontier 3, items 1-2). Cheap, safe, immediately useful for creators
   debugging pacing complaints, and zero model-facing risk on the dashboard
   half.
3. **NPC-scoped reflection only** (Frontier 1, item 2 - not the full
   goal/intent NPC-agent scaffolding, and not the private-memory-write
   tool). Reuses shipped machinery, stays narrowly scoped, and meaningfully
   improves NPC continuity without opening the larger "NPCs as persistent
   agents with goals" project, which should stay a distinct, later, and
   explicitly product-owner-approved decision - the same way H6 and
   networked multiplayer are already flagged as needing one.
