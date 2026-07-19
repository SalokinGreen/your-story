# AI Game Master Integration Plan

> Source paper: *Architecting the Perfect Autonomous AI Game Master Engine:
> A System-Agnostic Design Paper* (five-layer separation of concerns —
> state, entropy/oracle, director, memory, adjudication; "LLM proposes,
> deterministic engine disposes").
>
> This document maps that paper onto **this codebase specifically** — what
> we already have, what's a genuine gap, and what order to close the gaps
> in. It supersedes the "missing features" backlog in `mythic_notes.md`
> where the two disagree (that doc predates the staged pipeline and the
> current `StoryData.threads`/`StoryData.npcs` model).
>
> **See also:** `ai-gm-deep-audit-findings.md` — a follow-up pass that
> traced actual runtime code (not just schema/tool names) and found
> several places where an apparent guarantee isn't actually enforced
> (unbounded numeric tool args, an ungated `game_over`, two competing
> chaos-factor implementations where the correct one is dead code, and
> more). That doc's priority order supersedes §5 below for anything it
> also covers.

## TL;DR

We already run the paper's core thesis in production: the GM narrates and
requests tool calls, but state, dice, and oracle results are computed in
deterministic TypeScript, never decided by the model. Four of the five
layers exist in recognizable form. **The one layer that's genuinely
missing is the Director/Pacing layer** — nothing in this codebase decides
*when* to escalate, complicate, or ease off; chaos factor drifts passively
off win/loss streaks and nothing else reads it except the fate oracle. The
second real gap is that Layer 5 (Adjudication) validates tool-call
**syntax** (`toolValidation.ts`) but not narrative **consistency** —
whether the model's prose contradicts canonical state is currently the
model's own job to self-police (`gmTools.ts:1095`), which is precisely the
failure mode the paper's sycophancy section warns against.

Recommended order: (0) fix a stage-ordering bug that lets the model
narrate before oracle/dice results exist, (1) build the Director layer on
top of already-existing primitives (chaos factor, `checkScene`, threads,
NPCs), (2) add a deterministic consistency/leniency checker to Layer 5,
(3) enrich memory with time/entity structure, (4) build the regression +
adversarial eval harness. Do not build Layer 1/2 from scratch — they're
solid; extend them.

---

## 1. Layer-by-layer: paper vs. this codebase

| Paper's layer | Status | Where it lives |
|---|---|---|
| **(1) Deterministic state** | **Mostly done** | `StoryData` in `app/misc/structs.ts` (~1100 lines) is the single authoritative object: `inventory`, `abilities`, `conditions`, `npcs`, `threads`, `combatState`, `quests`, `timers`, `agmtState`. Persisted as one JSONB blob (`docs/database-schema.sql`). Mutated only through tool calls (`gmExecutor.ts`, `toolExecutor.ts`), never inferred from prose. |
| **(2) External entropy/oracle** | **Mostly done** | `diceFormula.ts` (true RNG, `Math.random()`-backed) + `formula_roll`/`opposed_formula`/`formula_challenge_check`/`start_challenge` tools resolve every check outside the model (`docs/game-mechanics.md`). `mythic.ts`/`mythicChaos.ts` implement the Mythic fate oracle (`fate_question`, `roll_table`, chaos factor 1–9, random-event detection on doubles). |
| **(3) Director/pacing/drama manager** | **Missing** | No tension curve, no beat-type selection, no PbtA-style GM move menu, no spotlight tracking, no player model. `reasoningTiers.ts` is a *compute-cost* router (which model/effort handles a turn), not a narrative-pacing controller — don't confuse the two. Mythic's own scene-check mechanic (`checkScene`/`setupScene` in `mythic.ts:218,536`) is implemented but **dead code** — no tool schema exposes it, so it never fires. |
| **(4) Memory architecture** | **Mostly done** | `MemoryEntry` array + pgvector semantic search (`embeddings.ts`, `embeddings-migration.sql`, mistral-embed, HNSW index) + rolling scene summarization (`compaction.ts`) when history ages out of budget. Gap: `MemoryEntry` is just `{content, embedded?}` (`structs.ts:218`) — no timestamp, scene index, or entity link, so it's closer to flat retrieval than the paper's recommended entity-event structure. |
| **(5) Adjudication/validation** | **Partial** | `toolValidation.ts` does JSON-schema arg validation with correctable errors fed back to the model — solid, but it's a *type* checker, not a *truth* checker. There is no deterministic pass that checks whether narration contradicts `StoryData` (dead NPC talking, item not in inventory, wrong location) — the system prompt just asks the model to self-verify consistency (`gmTools.ts:1095`), and there's no check for whether the model skipped a roll it should have made. |

The headline gap is unambiguous: **build the Director layer; harden
Layer 5 from "ask the model to behave" to "verify the model behaved."**
Layers 1/2/4 need extension, not replacement.

## 2. A claimed bug that turned out not to be real — corrected

> **Correction (post-C4/H2 fixes):** this section originally claimed
> `buildStoryPrompt` ("Stage 1") runs before `buildToolPrompt`/tool
> resolution ("Stage 2a") within a turn, based on those functions' file-order
> labels in `ai_staged.ts`. That's wrong. `generation.ts`'s actual runtime
> order is "STAGE 0.5: GM Stage" (tool calls, dice, oracle - via
> `buildGMStagePrompt`) *first*, then story narration
> (`generation.ts:612-628`), and the narrator/DM system prompts say so
> explicitly: "The GM has already resolved dice rolls, table results, and
> state changes" (`ai_staged.ts:1219-1220`, `:1288-1289`). `buildToolPrompt`
> itself (the function this claim was based on) turned out to be dead code
> - never called anywhere - superseded by `buildGMStagePrompt`. Phase 0
> below is retracted; there was no ordering bug to fix.
>
> Fixing H2 found a real, related bug in the same neighborhood instead:
> `buildGMStagePrompt`'s tool whitelist (`stateToolNames`,
> `ai_staged.ts:2815-2848`) was missing `increment_scene` entirely - the
> schema and executor both existed, but the model could never call it. See
> `ai-gm-deep-audit-findings.md`'s H2 section for the fix. The general
> lesson holds, just from a different bug: a schema/executor existing is
> not evidence a tool is reachable - check the whitelist actually sent to
> the model.

## 3. Phased plan

### Phase 0 — ~~Fix stage ordering~~ RETRACTED (see §2 correction)

There was no ordering bug: the GM stage (tool calls, dice, oracle) already
runs before narration every turn. What *is* worth keeping from this phase's
original intent - a regression test asserting no `formula_roll`/
`fate_question` tool call appears in a turn's tool log *after* narration
references its result - has a real equivalent already added:
`tests/aiStaged.gmStageToolWhitelist.test.ts` asserts against
`buildGMStagePrompt`'s actual returned tool list, which is the more useful
check (a tool being reachable at all is a stronger prerequisite than
ordering was ever going to be).

### Phase 1 — Director/Pacing layer

This is genuinely new code, but it should be built almost entirely out of
primitives already sitting in this codebase, unused:

- ~~**Wire up the existing scene-check mechanic.**~~ **Done** (C4 in
  `ai-gm-deep-audit-findings.md`). `checkScene()`/`adjustChaosFactor()`
  (`mythic.ts`) also had a die-size bug independent of being unwired (d100
  against a 1-9 scale instead of d10) — fixed alongside the wiring.
  Implemented via `increment_scene` (already model-callable at scene
  transitions) rather than a new standalone `check_scene` tool, and its
  Interrupted-triggered random events now persist as
  `StoryData.pendingRandomEvents` (H2) instead of a one-off hint.
- **Clocks, not just chaos.** `StoryData.timers` (`manage_timer` tool)
  already gives you a countdown primitive — reuse it rather than adding a
  parallel "clocks" concept. Add a thin `Front`-style wrapper: a clock
  that's explicitly tied to a `StoryThread` and ticks on GM-move triggers
  (see below) rather than only wall-clock/turn-count. This is the
  paper's "inexorable stakes" primitive, and 90% of the plumbing
  (`StoryThread[]`, `manage_timer`) already exists.
- **A PbtA-style GM-move policy, not a new `adjust_chaos` tool for the
  model.** `mythic_notes.md`'s own Phase 1 backlog (§"Chaos Factor
  Management") proposes an `adjust_chaos` tool the *model* calls to raise
  or lower chaos. **Do not build that tool as specified** — letting the
  model directly control its own difficulty/pacing knob is exactly the
  authority-inside-the-model anti-pattern the source paper spends its
  whole §3.4 on (a model that can raise or lower its own stakes will
  reliably choose not to). Keep chaos-factor adjustment fully deterministic
  and outcome-driven, as `mythicChaos.ts::calculateChaosAdjustment`
  already does (based on skill-check streaks) — just widen its inputs
  to also react to scene-check results and thread/clock resolution
  (Mythic's actual rule: chaos rises on chaotic/unexpected scene
  endings, falls on calm/expected ones), not only pass/fail streaks.
  Instead, give the model a bounded **move menu** it selects from
  ("announce future badness," "tick a clock," "spotlight another PC," "put
  someone in a spot") — the *selection* of which move fires when should be
  a deterministic policy (triggered by scene-check results, a stalled
  clock, or a lull in the tension estimate below), with the LLM only
  responsible for rendering the chosen move as prose, per the PbtA
  discipline of "make your move, but never speak its name."
- **A minimal tension estimate.** Doesn't need to be sophisticated to be
  useful: a scalar nudged up by combat/clock-near-zero/scene-check
  "Interrupted" results and down by rest/quiet scenes, read by the move
  policy above to decide procedural vs. dramatic beats (Laws' "having an
  easy time? drop in a hard move"). This can literally live as one more
  field on `agmtState` alongside `chaosFactor`.
- **Spotlight tracking** only matters once multi-PC/party play exists in
  this engine; skip it unless/until that's on the roadmap.

### Phase 2 — Harden Layer 5: from self-policing to verification

- **Consistency checker.** Before committing narration, run a cheap
  deterministic pass that flags obvious contradictions against
  `StoryData`: does the prose reference an NPC whose `status` is
  `deceased`/`departed`, an item not in `inventory`, a location the party
  isn't at? Start with simple name/entity matching (NPCs and items are
  already named, structured records — `NPC[]`, `InventoryItem[]` — so this
  is pattern matching against known-entity lists, not NLP). Reject/flag
  for regeneration on a hit, the way `toolValidation.ts` already does for
  malformed tool args.
- **Leniency/false-pass audit.** Log, per turn, whether the narrative
  content implies a contested action occurred without a corresponding
  `formula_roll`/`opposed_formula`/`fate_question` call in that turn's
  tool log. This doesn't need to block generation immediately — start as
  an offline metric (feeds the Phase 4 eval harness), then promote to a
  live validation-gate rule once you have a baseline false-pass rate to
  compare against.
- **Safety commands as a Layer-5 concern, not a prompt.** If there's a
  players'-side safety/report mechanism planned, it should route through
  this same deterministic validation gate (always-available, model can't
  override it) rather than being instructions the system prompt asks the
  model to honor.

### Phase 3 — Memory: add structure, not just more retrieval

- Add `timestamp`/`sceneIndex` and an optional `entityIds: string[]` to
  `MemoryEntry` (`structs.ts:218`) so memories can be filtered/ranked by
  recency and by which NPCs/threads they touch, not just embedding
  similarity. This is a small, additive schema change (optional fields,
  backward-compatible with existing saves — consistent with how
  `game-mechanics.md` already documents deprecated fields being kept for
  compatibility).
- Keep `compaction.ts`'s rolling-summary approach — it's already the
  right shape (summarize aged-out parts into `scene.summary` rather than
  silently dropping them). The gap is that summaries and semantic search
  currently have no cheap way to be cross-checked against canonical state;
  once Phase 2's consistency checker exists, run it against retrieved
  memory too, not just fresh narration.
- Canonical-fact injection (`buildStoryInfoMessage`/`buildInfoMessage`)
  already does the paper's "verbatim canon cache" pattern well — no
  change needed there beyond feeding it the Phase 1 director state too.

### Phase 4 — Evaluation harness

Mirror the paper's split between objective and subjective checks, built on
top of the existing `tests/` Vitest suite rather than a new framework:

- **Regression harness**: scripted multi-turn campaigns (extend existing
  dice/tool/compaction tests) asserting a stable (non-growing) contradiction
  count as turn count increases, and that every tool the codebase defines an
  executor for is actually reachable in `buildGMStagePrompt`'s tool list
  (the H2 whitelist-gap fix's more general lesson).
- **Adversarial persuasion suite**: player inputs that argue for an
  unearned success ("the guard already told me it's fine," authoritative
  or pseudo-logical phrasing) — assert the GM still calls
  `fate_question`/`formula_roll` rather than narrating success directly.
  This is the CoC-Seduce-style false-pass measurement from the paper,
  and it's exactly what Phase 2's leniency audit already logs — this
  phase just turns that log into CI-graded assertions.
- **Imposed-failure rate**: sanity check that failures logged by the
  oracle/dice layer actually surface as narrated setbacks, not silently
  soft-pedaled into success.
- Skip LLM-as-judge subjective scoring (pacing "feel," fun) until the
  objective harness is green — per the paper's own staged recommendation,
  don't let subjective tuning mask the underlying architecture gap.

## 4. Explicit non-goals

- **Don't structure character stats.** `game-mechanics.md` documents a
  deliberate move away from `Stat[]`/`Resource[]` toward a freeform
  character-sheet note — this is an intentional design choice (GM-reads-
  notes over video-game stat block), not an oversight, and it's a
  reasonable divergence from the paper's default "everything structured"
  posture. Leave it as-is; the paper's structured-state recommendation
  applies to *canonical facts the GM commits to* (who's alive, where the
  party is, what's in the bag), which already are structured.
- **Don't give the model a direct chaos/difficulty dial** (see Phase 1).
- **Don't rebuild Layers 1/2/4 from scratch** — extend the existing
  `StoryData`/oracle/memory code; there's no architectural reason to
  replace any of it.

## 5. Suggested order of work

_Phase 0 is retracted (§2) and Phase 1's scene-check wiring is done (C4,
H2) — see `ai-gm-deep-audit-findings.md` for what's landed so far._

1. Phase 2's consistency checker — highest defect-prevention value per
   unit effort, and it's the direct fix for the one architectural gap
   this repo's own code comments admit to (`gmTools.ts:1095`).
2. Phase 1's remaining director pieces (clocks/fronts wrapper, move menu,
   tension estimate).
3. Phase 3 (memory structure) and Phase 4 (eval harness) — do these
   together since the harness needs the structured memory to measure
   contradiction rates meaningfully.

---

_Written against the codebase at commit `005a893` (July 2026)._
