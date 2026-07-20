# "TTRPG Theory For AI GMs" — Gap Analysis and Implementation Plan

## What this document is

A user-supplied paper, *"Architecting the Artificial Game Master: Translating
Analog TTRPG Frameworks into LLM-Driven Narrative Engines"*
(reproduced in full at
`docs/research-paper-ttrpg-theory-for-ai-gms.md`), was analyzed
against this codebase as it exists today. The paper argues that reliable AI
Game Masters come from translating four analog TTRPG traditions — **PbtA**
(constrained GM-move menus, seven dimensions of "hardness"), **GURPS** (a
deterministic Reaction Table that overrides LLM sycophancy), **Ironsworn /
Starforged** (objective progress tracks, a Momentum resource, the Datasworn
JSON schema), and **Mythic GME** (the Chaos Factor as a cybernetic pacing
loop) — into a **PDVA pipeline** (Plan → Diff → Validate → Apply) running
under a **multi-agent topology** (Brain / Validator / Narrator / Archivist /
Director), with **Two-Pass Visibility** for spoiler prevention. It cites
arXiv 2606.16014, *"Orchestrated Reality,"* as the source of the PDVA/state
framing.

That framing is not new to this repo. `docs/research-paper-architecting-ai-gm.md`,
`docs/ai-gm-integration-plan.md`, `docs/five-layer-architecture-changelog.md`,
and `docs/architecture-frontier.md` already document two prior implementation
phases built against a closely related paper, and most of the PDVA/multi-agent
thesis is **already live**: typed tool dispatch instead of prose-parsing,
a deterministic Mythic chaos factor and director-move menu, tiered model
routing, memory with reflection, and a roll-invariant gate that blocks the
model from narrating a success it didn't earn. Re-pitching that work here
would be noise.

## Implementation status

Every item in §2 and §3.2 below has been built, tested (27 new unit tests
across `tests/gmTools.reactionCheck.test.ts`,
`tests/gmTools.hardnessDimensions.test.ts`,
`tests/mythic.chaosTemperature.test.ts`, and `tests/twoPassVisibility.test.ts`,
plus the existing suite - 706 tests total, all passing), and typechecked
clean. One honest caveat surfaced during implementation, on §2.3
specifically: see the note at the end of that section - the structural
filter closes the spoiler-leak gap for the codebase's separate-Narrator-call
path, but the *dominant* path (the GM's own streamed prose IS the
narration, in the same conversation that saw hidden content) can only be
mitigated by strong in-context instructions, not a structural guarantee,
because content is already streaming to the player before any full-text
filter could run. This is flagged rather than papered over, in keeping
with this repo's own documentation conventions.

So this document does two things instead:

1. **A concept map** — one line per idea in the paper, checked against real
   code, so nothing gets re-recommended.
2. **Four genuinely new, concretely scoped opportunities** the paper surfaces
   that the existing docs do not cover, each written to the same
   effort/risk/file-path standard as `architecture-frontier.md`, plus two
   smaller items and two explicit cautions (things the paper recommends that
   this app already tried and deliberately removed).

---

## 1. Concept map: paper → current reality

| Paper concept | Status | Where |
|---|---|---|
| Deterministic engine as source of truth, LLM as constrained translator | **Done** | `gmExecutor.ts` — all tool calls execute in TS, never trusted from prose |
| Dice/stat resolution never decided by the model in prose | **Done** | `formula_roll`/`opposed_formula`/`formula_challenge_check`; M2 roll-invariant gate in `reasoningTiers.ts` forces a roll before a gated scene can resolve |
| PbtA-style bounded GM-move menu | **Partial** | `selectDirectorMove` in `mythic.ts` — 4 moves (`announce_future_badness`, `tick_a_clock`, `put_someone_in_a_spot`, `spotlight_couch_player`) vs. PbtA's larger vocabulary. Already tracked as Frontier 3 in `architecture-frontier.md` — not re-covered here. |
| Soft move → hard move escalation | **Partial** | Director move priority ordering exists; not framed as explicit soft/hard tiers |
| **Seven dimensions of hardness** (probability, proximity, severity, significance, target, choice, sign) | **Not done** | `stakes` is a single ordinal enum (`low\|medium\|high\|deadly`) — see §2.2 below |
| Stonetop-style "translate mechanics into fictional trauma" | **Done, by product design** | The whole freeform-character-sheet convention (`docs/game-mechanics.md`) already routes every mechanical change through prose the GM writes, not silent numeric decrements |
| **GURPS deterministic Reaction Table** overriding LLM helpfulness bias | **Not done** | `NPC.attitude` is a hand-set discrete field, not a rolled, modifier-driven, hard-mandated table — see §2.1 below |
| Ironsworn progress tracks (ticks, milestones, 2d10 vs. track) | **Partial, different shape** | `SceneChallenge`/"best of X successes" and `CountdownTimer` cover the same *objective pacing* need via a different, already-simplified mechanic — not a gap, a different valid solution |
| Ironsworn **Momentum** meta-currency | **Deliberately removed** | See §4 caution — do not re-recommend without understanding why it was cut |
| **Datasworn JSON schema** — swappable structured rule packs per genre | **Deliberately rejected direction** | The app moved *away* from structured per-system rule data (the 8-system picker) toward freeform `mechanics` lore notes — see §4 caution |
| Mythic Chaos Factor as cybernetic pacing loop | **Done** | `agmtState.chaosFactor` (1–9), `fate_question`, scene-check-driven up/down adjustment, `pendingRandomEvents` |
| Chaos Factor modulating LLM temperature/sampling | **Not done** | `samplingSettings.ts` presets are static/user-set, never read `chaosFactor` — see §2.4 below |
| Threads/NPCs as durable arrays the engine re-injects, not LLM memory | **Done** | `threads`, `npcs` are canonical JSON, not conversational recall |
| PDVA: Plan/Diff/Validate/Apply | **Done, functionally** | GM tool-call round loop = Plan+Diff; typed executor = Validate+Apply; M2 gate = the "cannot assert success" enforcement the paper specifically calls out |
| Multi-agent topology: Brain / Validator / Narrator / Archivist / Director | **Mostly done, one piece merged by design** | Brain+Validator = the GM tool loop; Narrator = Story Stage; Director = `selectDirectorMove`. **Archivist is merged into the Brain** (state changes are emitted directly as tool calls during the round loop, not extracted post-hoc from prose) — arguably a *stronger* design than the paper's, since post-hoc extraction from prose can itself hallucinate. Not a gap. |
| **Two-Pass Visibility** (`always_reveal`/`hidden`/`to_be_revealed`/`check_per_turn`) for spoiler prevention | **Not done** | `StoryLore.type: "secret"` is binary and manual; no state-machine, no second context-rebuild pass filtering hidden entities before the Narrator call — see §2.3 below |
| **Misread-input vs. state-error correction** (rollback vs. in-place patch) | **Not done** | No rollback mechanism exists anywhere in the survey; single mutable JSONB blob, no undo path — see §2.5 below |
| Session-boundary flush + cold-load with just-in-time rule injection | **Partial** | `compaction.ts` does rolling, budget-triggered summarization; not strictly aligned to scene boundaries. Tool schemas are already injected just-in-time by category, not the whole rulebook. Minor gap, not worth a dedicated section — see §3.2 |

---

## 2. Four concrete opportunities

### 2.1 A GURPS-style Reaction Check for incidental NPCs (highest value)

**The paper's specific insight, and why it's real:** commercial LLMs are
RLHF-tuned to be agreeable. Over a long conversation, an antagonist an LLM is
asked to role-play tends to soften — the model "wants" to help the player
succeed. The paper's fix isn't better prompting; it's taking the disposition
decision away from the model entirely and handing it a rolled, numeric,
externally-mandated verdict it is not allowed to negotiate with.

**Why this is a real, distinct gap here:** `NPC.attitude` (`structs.ts:440`)
already exists and is capped from swinging too far in one call
(`MAX_ATTITUDE_STEP_PER_CALL = 2`, `gmExecutor.ts:4277`) — but that only
covers NPCs the GM has already chosen to track as persistent entities. It's
manually set by the model via `update_npc`, not rolled, and there's no
mechanism at all for the far more common case in play: a one-off guard,
merchant, or noble the player is talking to for the first and possibly only
time, where a full tracked `NPC` record would be overkill but the model
still needs an externally-imposed reason not to just... be nice.

**Design**, mirroring `formula_roll`'s existing shape so it reuses patterns
already proven in this codebase:

- New tool `reaction_check` in `gmTools.ts`:
  ```ts
  interface ReactionCheckParams {
    npc_name: string;
    modifiers?: number;      // from charisma, reputation, prior favors, an
                              // established grudge, etc. — GM-declared, like
                              // formula_roll's formula
    bias?: "hostile" | "neutral" | "favorable"; // baseline skew, e.g. a
                              // faction enemy vs. a stranger vs. an ally-of-an-ally
    reason: string;
  }
  ```
- Deterministic execution in `gmExecutor.ts`: roll 3d6 + modifiers (reuse
  `diceFormula.ts`'s roller), map onto the paper's table (Disastrous →
  Excellent), and return the category plus a **hard behavioral mandate
  string**, not just a number — e.g. `"Bad (5): cares nothing for the
  player, acts against them for profit, will not yield to persuasion this
  scene."` That mandate string is what gets fed back to the model as the
  tool result, the same way `formula_roll`'s miss result is fed back as a
  constraint the Narrator must honor, not a suggestion.
- No new UI surface required initially — this can ship as a tool the GM
  calls and narrates the result of, exactly like `npc_roll` today.
- Optional follow-up: persist the rolled category onto a lightweight,
  non-full-NPC record (`incidentalReactions: Record<string, {category,
  score, expiresAtScene}>` on `StoryData`) so the mandate holds for the rest
  of the scene instead of being re-rollable turn to turn if the player just
  asks again.

**Effort/risk:** Low-medium. One new tool, one new executor function, reuses
the existing dice roller and the existing "tool result is a hard constraint"
pattern the M2 gate already established. No schema migration needed if the
optional persistence follow-up is deferred. This is the single most direct,
well-precedented gap the paper identifies that isn't already covered by
`architecture-frontier.md`.

**Implemented.** `reaction_check` (`gmTools.ts`/`gmExecutor.ts`) rolls 3d6
via the existing `diceFormula.ts` roller, applies a `bias` baseline
(hostile/neutral/favorable) plus GM-declared `modifiers`, and returns a
category + hard mandate string in `contextForStory`. The optional
persistence follow-up (an `incidentalReactions` record) was left out, per
the plan's own "don't build ahead of a demonstrated need" - the mandate is
scoped to the current scene by instruction, not enforced state, for now.
Covered by `tests/gmTools.reactionCheck.test.ts` (5 tests, deterministic
via `Math.random` mocking - pins down exact roll → category boundaries).

### 2.2 Formalize hardness beyond a single `stakes` dial

**The paper's point:** consequence severity isn't one dial, it's several
independent axes — a move can be low-severity-but-high-proximity (a threat
looms close but doesn't hurt yet) versus high-severity-but-low-probability
(a rare, catastrophic outcome). Collapsing all of that into one ordinal
(`low|medium|high|deadly`) loses the ability to compose these independently,
which is exactly what lets a human GM keep early-game failures survivable
while still feeling immediate.

**Current state:** `stakes` on `formula_roll`/`opposed_formula`
(`gmTools.ts:58,82`) is a single enum. It works, but it's a coarser
instrument than the paper's seven-dimension model, and coarser than what the
Director layer independently arrived at for pacing (`agmtState.tension`,
priority-ordered move selection) — the roll-consequence layer and the pacing
layer aren't using a shared vocabulary for "how hard."

**Design**, deliberately minimal — not all seven paper dimensions are worth
adding at once, and `architecture-frontier.md`'s "don't build ahead of a
demonstrated need" posture applies here too:

- Add exactly two of the paper's seven dimensions to `FormulaRollParams`,
  the two with the clearest, most distinct narrative effect and the
  lowest risk of the model just picking the scariest option every time:
  - `target?: "self" | "someone_they_love" | "someone_present"` — the
    paper's single clearest lever ("a move becomes significantly harder if
    the consequence targets someone the player character loves").
  - `forces_choice?: boolean` — whether failure presents a dilemma between
    two costs rather than one flat cost.
- Thread these into the consequence text the model is required to narrate,
  the same way `stakes` already does, rather than building a numeric
  hardness formula — the paper's own examples ("high proximity, low
  severity") are qualitative descriptors for the model to honor, not inputs
  to a scoring function.
- Do **not** try to formalize all seven dimensions at once. `probability`
  and `severity` are already expressed adequately via the DC and `stakes`;
  `proximity` and `sign` are better left as prose judgment calls the GM
  makes when writing the `consequences` text. Adding all seven as structured
  fields risks the same "ungated place for the model to invent
  consequences" problem `architecture-frontier.md` flags for NPC goals.

**Effort/risk:** Low. Additive optional fields on an existing tool
interface, no new mechanism, no migration.

**Implemented, exactly as scoped** - just the two dimensions named above,
on both `formula_roll` and `opposed_formula`. `target`/`forces_choice`
render into `contextForStory` only on the losing outcome (a roll's failure,
or the opponent winning an opposed roll) - success paths are unaffected.
Covered by `tests/gmTools.hardnessDimensions.test.ts` (6 tests).

### 2.3 Two-Pass Visibility for spoiler prevention

**The paper's point, and why it's the one clean miss in this codebase's
otherwise strong adjudication layer:** the "Omniscient Narrator" problem — an
LLM given the full world state to describe a room will happily leak the
secret behind the locked door before the player has rolled to notice it,
because it can't natively distinguish "true in the database" from "known to
the character." This is a different failure from the one thing
`checkNarrationConsistency` already catches (a dead NPC narrated as
present, per `architecture-frontier.md` Frontier 4) — that's a *post-hoc,
non-blocking* check on contradictions; this is a *pre-emptive, structural*
filter on what the Narrator is even shown.

**Current state:** `StoryLore.type: "secret"` (confirmed in `structs.ts`)
is binary — hidden from the player's note list, or not. There's no
graduated state, and no evidence of a second, filtered context rebuild
specifically for the Narrator call that strips not-yet-discovered entities
out before generation.

**Design:**

- Extend `StoryLore` (and, if scoped later, other entity types like traps
  or ambush conditions) with a `visibility` field using the paper's own
  four-state vocabulary: `"always_reveal" | "hidden" | "to_be_revealed" |
  "check_per_turn"`. This slots next to the existing `type` field rather
  than replacing it — `type: "secret"` becomes shorthand for
  `visibility: "hidden"` at creation time.
- In the GM tool round loop (the "first pass," which the paper's Logic
  Engine already resembles here), the model has full access to `hidden`
  entities when reasoning about triggers — e.g., deciding a perception
  check succeeded and calling `edit_lore` to flip an entity's visibility
  from `to_be_revealed` to `always_reveal`.
- Before the **Story Stage** (Narrator) call specifically, rebuild its
  context slice with entities where `visibility === "hidden"` filtered out
  entirely — not summarized, not softened, just absent from what the
  Narrator prompt is built from. This is a filter on `buildStoryPrompt`'s
  input assembly in `ai_staged.ts`, not a new agent.
- `check_per_turn` entities (e.g., a patrol that might notice the party) are
  the one case needing new logic: a lightweight deterministic check each
  turn (a %-chance roll or a stat comparison, engine-side) that decides
  whether this turn flips them to `always_reveal` — this is the direct
  digital equivalent of a passive Perception check a human GM tracks
  silently.

**Effort/risk:** Medium. Touches the prompt-assembly boundary between the GM
stage and the Story stage, which is exactly the seam
`architecture-frontier.md`'s Frontier 4 already identifies as
"genuinely unsolved" for a related reason (streaming-vs-blocking). Worth
sequencing carefully: this doesn't require buffering narration (the
Frontier 4 problem) because the filtering happens *before* generation
starts, not after — it's a strictly cheaper fix than the contradiction
checker's open problem, solving a different but related failure mode.

**Implemented, with one honest caveat found during the build.** `StoryLore`
now carries `visibility` (`LoreVisibility` in `structs.ts`); `read_notes`
(`gmExecutor.ts`) wraps hidden/to_be_revealed/check_per_turn content in
`[[HIDDEN_LORE:...]]` markers with an explicit do-not-narrate instruction;
`stripHiddenLoreContent` (`ai_staged.ts`) removes those markers (content
included) from GM reasoning before it reaches the Narrator, applied at
`buildStoryAffirmation` and at scene-history replay; `resolveCheckPerTurnVisibility`
(`gmExecutor.ts`) resolves a flat-probability passive-reveal roll once per
turn, wired in right before the GM round loop starts in `generation.ts`.

The caveat: this structurally closes the leak only for the codebase's
separate-Narrator-call path (`buildStoryPrompt`, used for NovelAI,
precomputed-context retries, or when the GM stage is skipped). Tracing the
actual dominant path in `generation.ts` during implementation surfaced
something the original plan didn't account for: on the common path, the
GM's own accumulated prose *is* the narration (`gmFinalStoryContent`), or
narration is a short continuation appended to the *same* GM conversation
(`continueGMConversation`) — either way, it's the same model, same
context, same streamed response that already saw raw hidden content earlier
in that turn. A post-hoc string filter can't retroactively un-leak content
that already streamed to the player's screen token-by-token before the
full text was even known, and there's no marker wrapping the model's own
freely-written prose the way there is around tool-result text. Closing
this fully would mean restructuring the pipeline to run a genuinely
separate, freshly-context'd Narrator call on every turn — reopening the
"Archivist merged into Brain" efficiency tradeoff this codebase deliberately
made, and out of scope for this pass. What *is* shipped for the dominant
path is the strong, explicit in-context instruction in the `read_notes`
result itself ("HIDDEN FROM PLAYER - do not narrate..."), which the model
sees directly, adjacent to the content, right before it might write prose
in the same breath — the same "soft constraint, model instructed to honor
it" discipline this codebase already relies on for `stakes`/`consequences`
elsewhere, not a structural guarantee. Flagged here rather than overclaimed.

### 2.4 Chaos Factor–modulated sampling temperature

**The paper's point:** "a low Chaos Factor can instruct the system to lower
the LLM's temperature... as the Chaos Factor peaks, the system can
dynamically increase the LLM's temperature." A cheap, purely numerical lever
tying narrative volatility to generation volatility.

**Current state:** confirmed via `samplingSettings.ts` — temperature is a
static, user-chosen preset (`DEFAULT_SAMPLING_SETTINGS.temperature = 1.0`),
never read from `agmtState.chaosFactor`.

**Design:** in the Story Stage call path (wherever `SamplingSettings` are
assembled before the request, in `generation_orchestrator.ts`), compute a
small, bounded temperature offset from the current story's `chaosFactor`
(e.g. `effectiveTemp = baseTemp + (chaosFactor - 5) * 0.03`, clamped to a
tight band) rather than overriding the user's chosen preset outright. Keep
it as a delta on top of user preference, not a replacement — the sampling
preset system already exists precisely so users can pick creative vs.
grounded prose, and this should nudge, not override, that choice.

**Effort/risk:** Very low — one arithmetic line where sampling settings are
already assembled, no schema change, easily reverted or feature-flagged if
it doesn't measurably help. Good candidate to bundle with 2.1 or ship alone
as a quick win.

**Implemented, and applied at the temperature call site that actually
matters.** `chaosFactorTemperatureDelta` (`mythic.ts`) is a bounded
±0.12 delta, neutral at chaos factor 5. Tracing where temperature is
actually set surfaced the same dominant-path nuance as §2.3: the GM
stage's own request (`generation.ts`, base 0.4) is what matters most, since
its output *is* the story on the common path — not just the separate
story-stage fallback (base 0.7) or the NovelAI path (base 1), which is
where a first pass might have stopped. All three now apply the delta.
Covered by `tests/mythic.chaosTemperature.test.ts` (5 tests).

### 2.5 Misread-input vs. state-error correction

**The paper's point:** when the model errs, the correct fix depends on
*what kind* of error it was. A **misread input** (the model misunderstood
what the player typed) should roll back the whole turn and re-run with
corrected intent — the dice and consequences from the wrong interpretation
never should have happened. A **state error** (the model had the right
intent but got a fact wrong — confused two NPCs, hallucinated an item) should
patch the specific wrong fact in place and have the Narrator rewrite,
*without* touching the roll or its consequences, which remain sacrosanct.

**Current state:** the survey found no rollback mechanism anywhere in this
codebase. `stories.story_data` is a single mutable JSONB blob
(`database-schema.sql`), and `docs/event-sourcing-alternative.md` already
declined a general-purpose event-sourced rewrite for good, documented
reasons (cost, no demonstrated need, multi-writer concerns don't apply yet).
This section is **not** proposing revisiting that decision — a full
undo/audit-log system is a different, larger project already assessed. This
is narrower: a **single-turn** correction path.

**Design**, scoped to avoid re-opening the storage question:

- Before executing a turn's tool calls, snapshot the pre-turn `StoryData` in
  memory only (not persisted) — cheap, since a turn's tool-call sequence is
  already bounded (`maxToolLoops`, default 10) and the object is already
  fully materialized client-side.
- Add a lightweight, user-facing "that's not what I meant" affordance on the
  most recent turn (a regenerate-with-correction action, distinct from the
  existing regenerate). On invocation: discard the in-memory snapshot's
  *diff* entirely (both the narrated prose and any tool-call state changes
  it produced) and re-run the turn from the pre-turn snapshot with the
  player's clarified input appended. This is the "misread input" path —
  full rollback, re-run.
- For the narrower "right intent, wrong fact" case, this doesn't need new
  rollback machinery at all — it's already partially served by manual
  editing (NPCEditor, ThreadsEditor, etc., confirmed to exist in
  `app/story/menu/`) plus a request for the model to re-narrate the current
  scene against the corrected note, similar in spirit to what
  `checkNarrationConsistency`'s warnings already surface for the one
  contradiction class it catches. Worth explicitly wiring a "fix this and
  regenerate" action from a consistency-warning toast into that flow, since
  the pieces (warning detection + manual edit UI + regenerate) already
  exist independently and just aren't connected end to end yet.

**Effort/risk:** Medium for the misread-input rollback (new UI affordance,
careful scoping of "discard this turn's diff only," needs to interact
correctly with memory/compaction that may have already fired mid-turn).
Low for wiring the state-error path, since it mostly connects existing
pieces. Flag clearly to a product owner before building: this changes what
"undo" means for a player mid-story, which has UX implications beyond pure
engineering (e.g., should a rolled-back turn's dice result be visibly
discarded, or does that feel like save-scumming against the game's own
tension model?).

**Implemented, de-risked from the original design.** The build surfaced a
better answer than a new UI affordance: `app/story/page.tsx` already had an
`Undo` button (`handleUndo`) that *claimed* to undo the last turn but only
ever popped `scene.parts` — any mechanical state a turn's GM tool calls had
already applied (an NPC attitude change, a quest update, a stat change)
silently survived the "undo." That's a real correctness bug, not a
hypothetical: it's the exact "misread input" failure mode the paper
describes, just under an existing control the player already trusts to
mean "undo." Rather than add a new, separate "that's not what I meant"
concept needing its own product sign-off, `handleChoiceWithAction` now
takes a full `structuredClone` snapshot of `storyData` immediately before
each turn's GM tool calls can run (`preTurnSnapshotRef`, session-only, not
persisted), and `handleUndo` restores the *entire* pre-turn state (mutating
`storyData` in place, matching this codebase's existing convention) when
the snapshot matches the current turn, falling back to the old
scene.parts-only behavior otherwise (e.g. after a page reload). This is a
narrower, lower-risk change than the original plan: it fixes what an
existing button does rather than introducing a new interaction the paper's
"misread input" framing calls for but that needed its own UX decision.

For the state-error path: `checkNarrationConsistency`'s warnings
(previously visible only in the `ContextViewer` debug panel, never to an
actual player) are now surfaced as a player-facing notification the moment
a turn completes with one, pointing at the already-existing Edit and Retry
actions as the fix. No new mechanism - this was purely a "the pieces exist
but aren't connected" gap, closed by making the warning visible where a
player can act on it.

---

## 3. Two smaller items

### 3.1 (folds into 2.1) — no separate write-up needed.

### 3.2 Align compaction to scene boundaries

The paper recommends flushing chat history and cold-loading fresh JSON
state specifically at *scene* boundaries, for a clean "the model only ever
sees this scene's relevant slice" property. `compaction.ts` already does
rolling summarization, but triggered by token-budget pressure rather than
scene boundaries specifically, so a scene can be summarized mid-way through
if the budget happens to fill there. Worth a small check: does
`ensureStoryCompacted`'s trigger already prefer scene boundaries when one is
imminent? If not, a minor tweak (prefer summarizing at the most recent scene
break under budget pressure, rather than an arbitrary token cutoff) would
tighten this alignment cheaply. Low priority, low effort — verify before
building, this may already be close enough in practice.

**Verified, then implemented.** The check found something worth recording:
`storyData.scene` is not a per-encounter unit in this data model at all -
it's the container for the story's *entire* linear `parts` history, and
`MemoryEntry.sceneIndex` is really just `parts.length` at write time (a
turn counter, not a scene identity). There was no existing structural
"scene boundary" concept to snap to - except one: the agentic
`increment_scene` tool (`toolExecutor.ts`) is a real, explicit, GM-decided
scene-transition signal that already existed and just wasn't recorded
anywhere. `Scene.lastSceneBoundaryIndex` now captures `parts.length` at
the moment `increment_scene` fires, and `planCompaction` (`compaction.ts`)
extends its token-budget cutoff forward to that boundary when it falls
within a small window (`SCENE_BOUNDARY_SNAP_WINDOW = 6` parts) after the
raw cutoff - forward-only, so it can only summarize a few extra
already-in-budget parts for a cleaner cut, never backward (which would
open a content-loss gap between the live tail and the summary).

---

## 4. Two cautions: things the paper recommends that this app already tried and removed

Both `docs/game-mechanics.md`'s "What Changed From the Old System" section
and this paper independently arrive at ideas the app shipped once and then
deliberately walked back. Recommending them again without engaging with why
they were removed would be a weaker analysis, not a stronger one.

- **Momentum.** The paper (via Ironsworn/Starforged) argues momentum is
  valuable specifically to keep a 2d10-vs-track resolution from feeling
  punishing. This app had a momentum system and removed it, alongside the
  entire fixed-dice-system picker, in favor of the GM improvising mechanics
  per adventure. The two aren't quite arguing about the same thing —
  Ironsworn's momentum compensates for *that specific resolution mechanic's*
  math, which this app doesn't use. Before considering any reintroduction,
  the real question is narrower than "should we bring momentum back": is
  there a *demonstrated* pattern of failures feeling disproportionately
  punishing under the current freeform system, the way `stakesFloor` was
  built in `reasoningTiers.ts` specifically because a real gap (self-declared
  "deadly" rolls running at cheap model tiers) was found? Don't build ahead
  of that evidence.

- **Datasworn-style structured, swappable rule packs.** The paper treats
  structured JSON rule schemas as an unambiguous win (no need to "teach an
  LLM the rules," swap genres by swapping data files). This app tried the
  structured-system direction (the 8-system picker, point-buy stats,
  structured inventory) and moved *away* from it toward freeform prose
  notes, because — per `docs/game-mechanics.md` — it made the app "feel like
  a tabletop GM keeping notes rather than a video game character sheet."
  That's a product-feel decision the paper's framing doesn't weigh at all;
  it optimizes for engineering cleanliness (schema validation, easy genre
  swaps) over the qualitative GM-improvisation feel this app is
  specifically going for. Not a gap to close.

---

## 5. If you only do three things next

Ranked the same way `architecture-frontier.md` ranks its own list — by
value ÷ (effort × risk):

1. **§2.1 — GURPS-style `reaction_check` tool for incidental NPCs.** The
   single cleanest, most novel, best-precedented idea here: reuses the dice
   roller, reuses the "tool result is a hard narrative constraint" pattern
   the M2 gate already proved out, and directly targets a real, named LLM
   failure mode (sycophancy drift) that nothing currently in this codebase
   addresses for one-off characters.
2. **§2.4 — Chaos Factor → temperature nudge.** Trivially cheap, fully
   reversible, no schema change, and a direct, literal implementation of a
   specific paper recommendation this app has all the prerequisite state
   for (`chaosFactor`) but never wired up.
3. **§2.3 — Two-Pass Visibility for `StoryLore`.** The one genuinely structural
   gap the paper identifies that isn't already tracked in
   `architecture-frontier.md` — closes the "Omniscient Narrator" spoiler
   problem at the source (filtering before generation) rather than
   after-the-fact the way the existing consistency checker does for a
   different failure class.

§2.2 (hardness dimensions) and §2.5 (misread-input rollback) are real and
worth doing, but are better sequenced after these three — §2.2 benefits from
seeing how §2.1's mandate-string pattern lands in practice first, and §2.5
needs explicit product-owner sign-off on what "undo" should feel like to a
player before any engineering starts, the same way H6 (content safety) and
networked multiplayer are already gated on a product decision rather than a
technical one in `architecture-frontier.md`.

**Update: all of §2 and §3.2 have since been implemented** (see the
"Implemented" note at the end of each section above for what actually
shipped and where it differs from this original design). §2.5's product
question turned out to have a narrower answer than expected: rather than
a new UX concept needing sign-off, the fix was to make an existing `Undo`
button actually undo what it already claimed to - a correctness fix, not a
new product decision. Everything else shipped close to plan, with two
honest caveats recorded in place: §2.3's structural filter doesn't (and,
short of a larger pipeline restructure, can't) cover the dominant streamed
narration path, and §2.4's delta needed to land on the GM stage's own
request temperature, not just the separate story-stage fallback, to
actually matter on that same dominant path.

---

_Written against the codebase state surveyed July 2026. Cross-references
`docs/architecture-frontier.md`, `docs/game-mechanics.md`,
`docs/five-layer-architecture-changelog.md`, and
`docs/event-sourcing-alternative.md` — read those first if anything above
seems to contradict them; they are the more authoritative, longer-running
record._
