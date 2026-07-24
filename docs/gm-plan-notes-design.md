# GM Plan Notes: A Rolling One-Beat-Ahead Campaign Spine

## Status

**Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5a/5b implemented.** Phase 5
(the "situation, not plot" reframe) landed its prompt/convention core (5a) and
its structured-reflection handoff (5b); **Phase 5c** (typed `steps?` on
`StoryThread`, dedicated boundary digest) remains deferred until a demonstrated
need. See the "Phase 5" section at the bottom for the full design and the
sub-plan checklist.

Phase 1 (prompt-only):
the `gm_plan` note type, the GM-stage injection, the `open_side_beat`/
`close_side_beat` tools, the player-facing lore UI entry. Phase 2
(deterministic re-planning gate): structured `PlanState`, the `advance_plan`
tool (`complete_current` → `write_next`), and a boundary gate in the GM-stage
loop that mirrors the M2 roll gate — when the GM marks a beat complete but
hasn't written the next one, the turn can't end on prose until it does. Phase
3 (spine presets + grounding *instruction*): the single fixed 7-beat spine was
replaced with three fixed presets keyed by campaign length (short/medium/long
— see "Spine length presets" below), and the prompt told the GM to read
existing lore/mechanics/dm_instructions notes before creating the plan.
**Phase 4 (grounding *enforcement* + oracle in planning)**: Phase 3's
grounding instruction was prompt-only and didn't reliably hold up in practice
(same failure mode Phase 2 was built to fix for beat-advancing), so it's now
an actual gate - `create_note` refuses to create the "Campaign Plan" spine
note until `read_notes`/`search_notes` has been called that turn, when there's
something to read. Phase 4 also adds guidance to reach for `fate_question`/
`roll_table` when the plan itself invents something uncertain. All four
phases are covered by tests.

## The problem this solves

The GM improvises well turn-to-turn but has no memory of *authorial intent*
across a session. It can lose the thread of what this campaign is about, let
character arcs go slack, and drift into episodic "and then, and then" pacing
with no build toward anything. Threads (`StoryThread`) and goals (`Goal`)
track open *plot instances*, and the director (`selectDirectorMove()`,
Layer 3) picks a good *next move*, but nothing holds the medium-horizon shape:
what beat of the story we're on and where each character is headed.

## The insight: borrow from coding agents

Coding agents follow multi-step plans reliably for three concrete reasons:

1. **The plan is re-injected every turn** — it never falls out of context.
2. **It's a checklist** — discrete `[ ]`/`[x]` items, so "done" is legible and
   progress is visible.
3. **It's only elaborated as far as the next step** — no attempt to script the
   whole future up front.

Point 3 is the load-bearing one for a *story*. A GM that writes a full outline
then railroads the player toward it is a worse GM, not a better one. The plan
must be a **rolling one-beat-ahead horizon**: the current beat is detailed, the
future is one-liners, and each player choice collapses possibilities rather
than confirming a predetermined path. This is fully consistent with "LLM
proposes, deterministic engine disposes" — the plan is proposal and intent, not
a script the engine enforces against player agency.

## How it maps onto the five-layer architecture

The plan note is primarily a **Layer 1 (state)** artifact — persisted in
`StoryData.lore`, tool-mediated like everything else — that serves
**Layer 3 (director/pacing)** by giving the per-turn director a longer-horizon
target. It does *not* replace threads/goals or the director; it sits above
them (see "Relationship to existing systems"). Phase 2's optional gate is a
**Layer 5 (adjudication)** hook, shaped exactly like the existing M2
roll-invariant gate in `consistencyCheck.ts`.

## The note: `gm_plan`

A new `LoreType`, following the identical pattern to `mechanics` /
`dm_instructions` / `character_sheet`:

- **Pinned**: loaded in full into the GM stage every turn (re-injection ⇒
  point 1 above).
- **Full text is GM-stage only and never shown to the narrator.** The plan
  contains future beats and hidden candidate arc directions; leaking it to the
  narrator stage would spoil prose and re-introduce railroading through the
  back door. A *redacted* projection is shown to the player — see "Player
  visibility" below.
- **One campaign-spine note, plus one arc note per player** (decided). The lore
  array is already repeatable and `character_sheet` already carries an
  `ownerCouchPlayerId` (`structs.ts:236`) to identify whose sheet is whose; the
  per-player arc notes reuse that exact field so a co-op story can hold one arc
  note per participant. Single-player is the common case: one spine note + one
  arc note.
- **Fixed beat names per preset** (decided, revised in Phase 3): the spine
  uses one of three fixed templates below, not GM-invented names — but which
  template depends on campaign length (see "Spine length presets"). A single
  7-beat spine was too coarse for long campaigns and too padded for one-shots;
  three presets keep beat names consistent *within* a given campaign's scope
  while giving the Phase 2 gate stable identifiers to key off, whichever
  preset is in play.

### Structure / template

Only the **current beat** is written in full. Everything ahead is a one-liner.

```markdown
# Campaign Plan

## Premise (1-2 sentences, stable)
What this campaign is fundamentally about.

## Spine  (only the CURRENT beat is detailed; future beats are one-liners)
- [x] Session 0 — Opening Image: establish/create the character(s), their
      ordinary world, the ache under it.
- [ ] Session 1 — Inciting Incident: <one line>
- [ ] Rising Complications: <one line>
- [ ] Midpoint Turn: <one line>
- [ ] Crisis / Climax / Resolution: <one line each>

## Current beat — <name>
Goal of this beat (what has to become true in the fiction before we advance):
- [ ] concrete checklist item
- [ ] concrete checklist item
Advance-when: the condition that means this beat is done.

## Character arcs  (per player; possibilities, not scripts)
### <Character name>
- Current state: <where they are emotionally / in the world right now>
- Candidate directions:
  1. <one possible arc>
  2. <another>
  3. <another>
- Active hooks: <what's currently pulling on them>
```

The **candidate directions** (plural, per player) are what keep it
non-linear — exactly the user's original framing. The GM tracks 2–3 live
possibilities per character and lets play collapse them; it does not pick one
and steer.

The beats above are the `medium` preset — a light TTRPG reframing of a
standard dramatic spine (story-circle / Save-the-Cat family), and the default
when the GM doesn't specify a length. The beat **names within the chosen
preset are fixed** (decided); the GM fills in each beat's content but does not
rename the spine. See "Spine length presets" for the other two presets and how
the GM picks one.

## Spine length presets (Phase 3)

The original design shipped one fixed 7-beat spine for every campaign. In
practice that was too coarse for long campaigns (one "Rising Complications"
beat has to cover everything between the midpoint and the crisis, however
many sessions that spans) and too padded for one-shots. Phase 3 replaces it
with three fixed presets, keyed by a new `SpineLength` (`"short" | "medium" |
"long"`, `structs.ts`):

- **`short`** (~5 beats) — a one-shot or short arc: Opening Image (Session 0),
  Inciting Incident, Rising Action, Climax, Resolution.
- **`medium`** (~7 beats, default) — an ordinary multi-session campaign: the
  original spine (Opening Image, Inciting Incident, Rising Complications,
  Midpoint Turn, Crisis, Climax, Resolution).
- **`long`** (~15 beats) — an extended, multi-arc campaign: a fuller
  Save-the-Cat-style beat sheet (Opening Image, Setup / Ordinary World, Theme
  Stated, Inciting Incident, Debate, Break Into Rising Action, B-Story, Fun
  and Games, Midpoint Turn, Bad Guys Close In, All Is Lost, Dark Night of the
  Soul, Break Into Finale, Climax, Resolution).

The GM judges which preset fits from the premise, any adventure-length hints,
and what the player has said they want, then passes it as `planSpineLength`
on the `create_note` call that creates the spine note (`toolSchemas.ts`);
`campaignPlan.ts`'s `initPlanState(spineNoteTitle, spineLength)` picks the
matching array from `CAMPAIGN_SPINE_PRESETS` (falling back to `medium` if
omitted or unrecognized — enforced both by the tool schema's enum and
defensively inside `initPlanState`). Beat names stay fixed **within** whichever
preset is chosen, so the Phase 2 gate's stable-identifier property is
unaffected — it just operates over a longer or shorter `beats` array.
`CAMPAIGN_SPINE_BEATS` is kept as a deprecated alias for `CAMPAIGN_SPINE_MEDIUM`
for backward compatibility with anything still importing the old name.

### Read before you plan (grounding) — Phase 3 instruction, Phase 4 enforcement

Phase 1-2 let the GM invent the spine and character arcs from nothing. Phase 3
added an explicit instruction: before creating the `gm_plan` spine note (or
the character sheet/mechanics notes alongside it, in the fresh-story setup
path), the GM should `read_notes`/`search_notes` any existing `lore`,
`mechanics`, and `dm_instructions` notes for the adventure. This matters most
for adventures built from a template (`Adventure.storyTemplate`) that ship
their own lore — without this, the GM could draft a plan that ignores or
contradicts established setting/rules it hasn't actually read yet.

Phase 3 shipped this as a prompt-only nudge, on the theory that Phase 2's gate
machinery was overkill for what looked like a simple instruction-following
problem. In practice it didn't hold up — the instruction competes with dozens
of others in a long system prompt and nothing stopped the GM from creating the
plan without ever calling `read_notes`. Phase 4 makes it an actual gate,
described in "Grounding enforcement" below.

## Grounding enforcement (Phase 4)

`toolExecutor.ts`'s `create_note` handler now refuses to create the `gm_plan`
note titled "Campaign Plan" unless `StoryData.notesReadThisTurn` is true — but
*only* when there's something worth reading: if the story has no existing
`lore`/`mechanics`/`dm_instructions` notes, the gate is a no-op (nothing to
ground against, so requiring a `read_notes` call would just be busywork). The
rejection returns `success: false` with a message telling the GM what to do
(`read_notes`/`search_notes`, then retry `create_note`); no separate
round-forcing gate is needed the way M2/Phase 2 need one, because the GM
stage's round loop already continues to another round whenever a round made
any tool call, and it naturally sees the failed response there.

`notesReadThisTurn` (`structs.ts`) is deliberately turn-scoped, not persistent
plan state like `PlanState` — it means "has the GM looked at existing notes
in the current turn," and is:

- **Reset to `false`** at the very start of `generateStoryTurnOnce`
  (`generation.ts`), so a `read_notes` call from a previous turn can't
  stale-satisfy this turn's gate.
- **Set to `true`** wherever `read_notes` or `search_notes` executes —
  `search_notes` is handled directly in `toolExecutor.ts`, `read_notes` in
  `gmExecutor.ts`'s own dispatch (it isn't delegated to `toolExecutor.ts`) —
  regardless of whether the search finds anything; the point is that the GM
  made the effort to check, not that it found something.
- **Visible to the same round's later calls**: the GM stage doesn't batch all
  of a round's tool calls through one `toolExecutor.executeTools` call —
  `gmExecutor.ts` dispatches them one at a time against a single
  `structuredClone`d `StoryData` (`modified`) shared across that loop, so a
  `read_notes` call earlier in the same round already flips the flag by the
  time a later `create_note` call in that same round checks it. Cross-round
  persistence works the same way: `modified` becomes next round's `storyData`
  via `Object.assign`, carrying the flag forward.

This intentionally scopes the *hard* gate to plan creation only — the
character sheet and mechanics notes created alongside it at Session 0 keep
Phase 3's prompt-only nudge. The plan is the piece most likely to silently
contradict established lore if invented blind (it's the thing this whole
design exists to keep coherent over a long campaign), so it's the piece that
gets the harder guarantee.

## Oracle in planning (Phase 4)

Plan-writing routinely means inventing something the GM doesn't actually know
yet — who the antagonist really is, how a beat's tension resolves, which of a
character's 2-3 candidate arc directions the fiction is leaning toward. The
CORE STANCE section of the GM prompt already has a rule against "manufactured
certainty" — deciding an uncertain fact by what feels safe or pleasant instead
of consulting `fate_question`/`roll_table` — but it was written for in-scene
narration, not plan-writing, and nothing pointed the GM at the oracle while
drafting or revising the plan. The CAMPAIGN PLAN section of the GM prompt
(`ai_staged.ts`) now carries the same discipline explicitly for plan content:
when inventing an uncertain premise detail, beat outcome, or candidate arc
direction, call `fate_question` (with an honestly calibrated likelihood) or
`roll_table` instead of defaulting to the first idea.

This is prompt guidance only, not a gate — unlike the read-notes case, there's
no reliable way to detect "the GM invented something uncertain here" in code,
so a structural requirement (e.g. "call the oracle at least once during
Session-0 setup") would either force oracle calls on plans with nothing
actually uncertain in them, or be trivially satisfiable with an irrelevant
roll. Better to point at the existing discipline than fake enforcement of it.

## Player visibility

**Fully transparent (decided).** The player can open the plan notes and read
them verbatim, future beats and candidate arc directions included. The product
call is that the see-behind-the-curtain transparency is worth more here than
preserving mystery — the player is a co-author, not an audience.

Mechanically:

- **GM stage**: full plan text, pinned every turn.
- **Narrator stage**: still excluded — not as a spoiler firewall (the player
  sees it anyway) but for **pacing and tokens**. The narrator's job is to
  render the *current* beat's prose; feeding it the whole forward plan invites
  it to pre-write beats that haven't happened. Same exclusion `dm_instructions`
  already gets.
- **Player UI**: the `gm_plan` notes surface in the normal notes/lore view so
  the player can read them. In co-op, arc notes still carry
  `ownerCouchPlayerId` for attribution, but visibility is not gated per player.

Because there's nothing to redact, there's no separate projection layer to
build — the notes render through the existing lore UI like any other note,
which makes this simpler than the redacted alternative would have been.

## Side beats (focus detours / side quests)

A GM needs to be able to *pull focus off the main spine* for a while — a side
quest, a character-focused detour, a self-contained episode — and then return.
This is a **pacing/focus** action, distinct from an open plotline
(`StoryThread`), so it gets its own explicit tool pair rather than being buried
in `edit_note`:

- **`open_side_beat({ title, goal, return_when, owner? })`** — creates a
  `gm_plan` note tagged as a side beat (its own small checklist + a
  `return_when` condition), and marks it the **active focus**. While a side
  beat is active, the GM-stage injection foregrounds *it* as the current beat;
  the main spine beat is shown as "paused, will resume." `owner` scopes a
  character-focused detour to one player in co-op.
- **`close_side_beat({ resolution })`** — resolves the side beat (records the
  outcome) and returns focus to the paused main-spine beat.

Focus is a small **stack**, not a boolean: opening a side beat pushes it,
closing pops back to whatever was underneath (usually the main spine, but side
beats can nest one level in practice). Phase 1 tracks the active side beat with
a lightweight pointer on `StoryData` (e.g. `activeSideBeatTitle?: string`) so
the prompt injection knows what to foreground; the enforcement stays
prompt-driven like the rest of Phase 1. Side beats appear in the player-visible
projection as the current focus (title + goal), same redaction rules as spine
beats.

Why a tool and not just a note: making focus-switching an explicit, tracked
action is what lets the director and (later) the Phase 2 gate reason about "are
we on a detour, and for how long" — and it stops side content from silently
becoming the main story with no way back.

## Bootstrap sequencing (matches the user's original design)

The existing `freshStorySetupBlock` (`ai_staged.ts:1307`) already nudges the GM
to create a `character_sheet` + `mechanics` note on a fresh story. Extend the
lifecycle:

1. **Setup / Session 0**: the GM first reads any existing `lore`/`mechanics`/
   `dm_instructions` notes (Phase 3 grounding step, above), then establishes
   character(s), then creates a `gm_plan` note containing **only** the Premise
   + a Session-0 beat ("establish/create the characters") sized by whichever
   `planSpineLength` it judged fits the campaign. The spine's later beats are
   blank one-liners; the arc section is empty. It does *not* plan ahead yet.
2. **End of Session 0**: the GM's job for the beat is to get the player(s) into
   character and established. When that beat's checklist is done, the GM writes
   the **Character Arcs** section and drafts **only** Session 1 (the inciting
   incident) in detail — nothing beyond it.
3. **Each subsequent boundary**: tick off the current beat, write the next one
   in detail, refresh candidate arc directions in light of what the players
   actually did. Always exactly one beat ahead.

## Relationship to existing systems (do not duplicate)

- **Threads / Goals** are the concrete, often player-facing *instances* that
  get spawned *from* the plan (a candidate arc becomes a real `StoryThread`
  when it goes live; a beat goal can surface as a player `Goal`). The plan is
  the GM's private intent; threads/goals are the tracked, sometimes-visible
  realizations. The prompt must say this explicitly so the GM doesn't re-invent
  threads inside the plan text.
- **Director (`selectDirectorMove()`)** still picks the per-turn move; the plan
  only gives it a target to aim the move toward. No change to the director in
  Phase 1.
- **Memory / reflection** is orthogonal — the plan is intent looking forward;
  memory is observation looking back.

## Enforcement

### Phase 1 — prompt-only (this iteration)

- Add `gm_plan` to the `LoreType` union, the pinned-type lists, and the
  `create_note` enum.
- Inject the pinned plan (spine + the active player's arc + any active side
  beat) into `buildGMStagePrompt` alongside the character-sheet/mechanics
  sections; **exclude it from the narrator stage**.
- Render the redacted player projection in the story UI ("Campaign" panel),
  scoped per player via `ownerCouchPlayerId`.
- Add the `open_side_beat` / `close_side_beat` tool pair + `activeSideBeatTitle`
  pointer on `StoryData`; foreground the active side beat in the injection.
- Add prompt guidance: create the spine + per-player arc notes at setup; only
  ever detail one beat ahead; tick the checklist via `edit_note`; when the
  current beat's advance-when condition is met, write the next beat before
  continuing; use `open_side_beat`/`close_side_beat` for detours rather than
  quietly wandering off the spine.
- Extend `freshStorySetupBlock` for the Session-0 creation step.

This is contained and reversible, and it proves the concept. Its known
weakness is compliance: like any un-gated instruction, the note can drift
(GM forgets to advance, or over-writes future beats). We accept that risk for
Phase 1 and watch for it.

### Phase 2 — deterministic gate (implemented)

Shaped like the M2 roll gate, and living in the same GM-stage round loop
(`generation.ts`). Pieces:

- **Structured state** (`StoryData.planState`, `structs.ts`): `{ beats,
  currentBeatIndex, awaitingNextBeat, spineNoteTitle, spineLength }`. A
  parse-free pointer into the fixed spine — the readable plan stays in the
  `gm_plan` note; this is only what the gate keys off. Auto-initialized when
  the spine note ("Campaign Plan") is created via `create_note`, so it layers
  onto the Phase 1 bootstrap with no extra setup step. (`spineLength` added in
  Phase 3 — see below.)
- **`advance_plan` tool** (`toolSchemas.ts` / `toolExecutor.ts`), two actions:
  `complete_current` marks the current beat done and sets `awaitingNextBeat`;
  `write_next` details the next beat (writing it into the note), advances
  `currentBeatIndex`, and clears the flag. At the final beat, `write_next`
  records "campaign spine complete" without overrunning the array.
- **The gate** (`campaignPlan.ts` `isPlanAwaitingNextBeat` + the loop in
  `generation.ts`): when a zero-tool-call round ends while `awaitingNextBeat`
  is true, push a re-prompt and force one more round with
  `toolChoice: "required"`, capped at 2 (`MAX_PLAN_ADVANCE_PROMPTS`) then
  fail-open — never a hard block, matching M2 and this codebase's "warn, don't
  block" posture. Its own counter, independent of the M2 gate's.

The beat **names are fixed within whichever preset is active**
(`CAMPAIGN_SPINE_PRESETS[spineLength]`, since Phase 3), which is what gives
the gate stable identifiers to advance through. Chose a dedicated
`advance_plan` tool over piggybacking `increment_scene` because beat
completion and scene increment are different rhythms — a beat can span many
scenes.

### Phase 3 — spine presets + grounding (implemented)

Two independent, prompt-level changes (see "Spine length presets" and "Read
before you plan" above for the full rationale):

- **Three fixed spine presets** instead of one — `CAMPAIGN_SPINE_SHORT` /
  `CAMPAIGN_SPINE_MEDIUM` / `CAMPAIGN_SPINE_LONG` in `campaignPlan.ts`, keyed
  by the new `SpineLength` type (`structs.ts`). `initPlanState` takes a
  `spineLength` parameter (default `"medium"`) and picks the matching preset.
  `create_note`'s schema gained an optional `planSpineLength` enum
  (`"short"|"medium"|"long"`), used only when creating the `gm_plan` "Campaign
  Plan" note; `toolExecutor.ts`'s auto-init reads it (falling back to
  `"medium"` if omitted or — defensively — unrecognized, though the schema's
  own enum already rejects anything outside the three values before the
  executor sees it).
- **Grounding instruction**: the fresh-story-setup block and the CAMPAIGN PLAN
  section of `buildGMStagePrompt` (`ai_staged.ts`) both now tell the GM to
  `read_notes`/`search_notes` existing `lore`/`mechanics`/`dm_instructions`
  notes before creating the character sheet, mechanics, or plan notes — a
  prompt-only nudge, no code gate.
- No change to the Phase 2 gate mechanics themselves — `isPlanAwaitingNextBeat`
  and `advance_plan` operate on `planState.beats` generically regardless of
  its length, so they needed no changes.

## Cost / budget

Pinning another full note consumes part of the 40% info budget
(`maxContextSize`, default 128k). The one-beat-ahead constraint is what keeps
it small; a soft size guidance in the prompt ("keep the plan under ~N lines;
future beats are one-liners") is the cheap defense. Worth measuring the added
tokens on a real session once implemented.

## Testing

Following the repo's `tests/*.test.ts` + seeded-`Math.random` conventions:

- `gm_plan` is recognized as a pinned type and injected into the GM prompt but
  **absent** from the narrator/story prompt (visibility regression).
- `gm_plan` notes surface in the player-facing lore view (visibility: the
  player can read them).
- `create_note` accepts `type: "gm_plan"` and round-trips through
  `toolExecutor`.
- `open_side_beat` sets `activeSideBeatTitle` and foregrounds the side beat in
  the injection; `close_side_beat` clears it and restores the spine beat as
  current focus.
- `freshStorySetupBlock` guidance appears only when no plan exists.
- A campaign-regression scenario (mirroring the existing one) that runs a few
  turns and asserts the plan notes are created and advanced across a beat
  boundary, that no future beat is written more than one ahead, and that a
  side beat opens and closes returning focus to the spine.
- Phase 3: `initPlanState` defaults to the medium preset and honors an
  explicit `short`/`long` `spineLength`; `create_note` threads a valid
  `planSpineLength` through to `planState.spineLength`/`beats` and rejects an
  out-of-enum value outright (schema validation); the GM prompt contains the
  "read before you plan" grounding instruction and documents all three
  `planSpineLength` presets.
- Phase 4: `create_note` rejects creating "Campaign Plan" when grounding notes
  (`lore`/`mechanics`/`dm_instructions`) exist and `notesReadThisTurn` is
  falsy, allows it once the flag is true, and doesn't gate when there are no
  grounding notes to read; `search_notes` (`toolExecutor.ts`) and `read_notes`
  (`gmExecutor.ts`, via `executeGMTools`) both set the flag, including the
  same-round-ordering case (`read_notes` then `create_note` in one round); the
  GM prompt marks the instruction "ENFORCED" and states what `create_note`
  will do, and separately documents pointing at `fate_question`/`roll_table`
  for uncertain plan content. A `generateStoryTurn` integration test covers
  both the rejection and the same-round unblock end-to-end.

## Decisions locked

- One campaign-spine note + **one arc note per player** (via `ownerCouchPlayerId`).
- **Fixed** beat names within whichever spine-length preset is active (revised
  in Phase 3 — was a single fixed list, now three: short/medium/long).
- **Fully transparent** to the player (notes render through the normal lore UI).
- A **side-beat tool pair** (`open_side_beat` / `close_side_beat`) for focus detours.
- The GM must **read existing lore/mechanics/dm_instructions notes before
  creating the plan**. Introduced as a prompt-only nudge in Phase 3; upgraded
  to an actual gate in Phase 4 after the nudge didn't hold up in practice.
- **Oracle guidance for plan content** (Phase 4): prompt-only, pointing the GM
  at `fate_question`/`roll_table` for uncertain plan elements — not a
  structural requirement, since there's no reliable way to detect "this beat
  needed the oracle and didn't get it" in code.

## Phased implementation checklist (Phase 1) — done

- [x] `LoreType` union — `app/misc/structs.ts`
- [x] `activeSideBeatTitle?` on `StoryData` — `structs.ts`
- [x] Pinned-type list (`BASE_PINNED_NOTE_TYPES`) — `ai_staged.ts`
- [x] GM-stage injection: spine + per-player arcs + active side beat, with the
      active side beat foregrounded — `buildGMStagePrompt`
- [x] `gm_plan` renders in the player lore view (`TYPE_CONFIG` + filter +
      create/edit dropdowns) — `app/story/lore.tsx`
- [x] `create_note` enum — `toolSchemas.ts`
- [x] `open_side_beat` / `close_side_beat` schemas (`toolSchemas.ts`) +
      executors (`toolExecutor.ts`) + GM-stage whitelist (`ai_staged.ts`)
- [x] `freshStorySetupBlock` extension + CAMPAIGN PLAN discipline section —
      `ai_staged.ts`
- [x] Tests — `tests/gmPlanNotes.test.ts` (9 tests)

The narrator/story stage continues the GM conversation rather than rebuilding
a fresh prompt, so the plan is only *added* in the GM stage (not in
`buildInfoMessage`/Choices). The pacing note in "Player visibility" stands: the
plan lives in the GM system prompt the narration continues from, and the
continuation prompt is what keeps the narrator on the current beat.

## Phased implementation checklist (Phase 2) — done

- [x] `PlanState` interface + `planState?` on `StoryData` — `structs.ts`
- [x] `campaignPlan.ts` — `CAMPAIGN_SPINE_BEATS`, `findSpinePlanNote`,
      `initPlanState`, `currentBeatName`, `isPlanAwaitingNextBeat`
- [x] `advance_plan` schema (`toolSchemas.ts`) + executor (`toolExecutor.ts`)
      + GM-stage whitelist (`ai_staged.ts`)
- [x] Auto-init `planState` on spine-note creation — `toolExecutor.ts`
      (`create_note`)
- [x] Plan progress + awaiting-next-beat surfaced in the GM injection, and the
      discipline section updated to use `advance_plan` — `ai_staged.ts`
- [x] Boundary gate in the GM-stage loop (own counter + cap, fail-open) —
      `generation.ts`
- [x] Tests — `tests/campaignPlan.test.ts` (helpers + executor) and
      `tests/generation.planGate.test.ts` (loop integration)

## Phased implementation checklist (Phase 3) — done

- [x] `SpineLength` type + `spineLength?` on `PlanState` — `structs.ts`
- [x] `CAMPAIGN_SPINE_SHORT` / `_MEDIUM` / `_LONG` + `CAMPAIGN_SPINE_PRESETS`
      (`CAMPAIGN_SPINE_BEATS` kept as a deprecated alias for `_MEDIUM`) —
      `campaignPlan.ts`
- [x] `initPlanState(spineNoteTitle, spineLength = "medium")` picks the preset
      — `campaignPlan.ts`
- [x] `planSpineLength` enum on `create_note` — `toolSchemas.ts`
- [x] `create_note` auto-init threads `planSpineLength` through (defaulting to
      medium) — `toolExecutor.ts`
- [x] Fresh-story-setup block + CAMPAIGN PLAN section: grounding instruction
      (read lore/mechanics/dm_instructions first) and the three presets
      documented, with `planSpineLength` usage — `ai_staged.ts`
- [x] Tests — `tests/campaignPlan.test.ts` (preset selection, fallback,
      validation rejection) and `tests/gmPlanNotes.test.ts` (prompt content:
      grounding instruction, preset documentation)

## Phased implementation checklist (Phase 4) — done

- [x] `StoryData.notesReadThisTurn?: boolean` (turn-scoped, documented as such)
      — `structs.ts`
- [x] Reset to `false` at the start of every turn — `generation.ts`
      (`generateStoryTurnOnce`)
- [x] `search_notes` sets it — `toolExecutor.ts`
- [x] `read_notes` sets it (on the shared cloned `StoryData`) — `gmExecutor.ts`
- [x] `create_note` gate: refuses "Campaign Plan" creation when grounding
      notes exist and the flag is unset; no-ops when no grounding notes exist
      — `toolExecutor.ts`
- [x] GM prompt: "ENFORCED" wording + what `create_note` will do; oracle
      guidance (`fate_question`/`roll_table`) for uncertain plan content —
      `ai_staged.ts`
- [x] Tests — `tests/campaignPlan.test.ts` (gate rejection/allow/no-op,
      `search_notes` flag-setting, `executeGMTools` `read_notes` flag-setting
      and same-round ordering), `tests/gmPlanNotes.test.ts` (prompt content),
      `tests/generation.planGate.test.ts` (full `generateStoryTurn`
      integration: rejection and same-round unblock)

---

# Phase 5 (DESIGN-ONLY): Situations, not plots — Fronts, triggers, floating clues, structured handoff

> **Status: 5a + 5b implemented; 5c deferred.** This section is the agreed
> design from the "campaign plan outline" discussion. It was written doc-first
> by request, then implemented after sign-off. The decisions locked were
> (1) **doc-first**, implement after review; (2) **keep the dramatic spine** —
> Phase 5 *demotes and reframes* it, it does not replace it; (3) **Front
> escalation steps as markdown** in the thread description (no `StoryThread`
> schema change); and (4) **structured handoff by extending `reflection.ts`
> with category tags** (option 1). See the sub-plan checklist at the end for
> exactly what shipped.

## The problem Phase 5 addresses

Phases 1–4 make the campaign plan reliable, but reliable *at being a linear
beat sheet*. The spine (`Opening Image → Inciting Incident → Rising
Complications → Midpoint → Crisis → Climax → Resolution`) is a Save-the-Cat
screenplay structure, and each beat advances on a narrative **advance-when**
condition — the GM prompt literally says "when the current beat's advance-when
is satisfied" (`ai_staged.ts`, CAMPAIGN PLAN section). That is the exact
railroad pattern flagged in the design critique that opened this discussion
("Advance When: Ryan has settled in…"): a *predetermined narrative event* the
players must arrive at for the story to progress. If they don't produce it,
the plan stalls or the GM nudges them toward it.

The critique's prescription is the standard modern-TTRPG one — **write
situations, not plots**: independent factions with their own agendas
(*Fronts*, PbtA), doom clocks that advance on their own (*Progress Clocks*,
Blades), clues decoupled from any specific route (*Secrets & Clues*, Lazy GM),
and **action/time triggers** instead of narrative ones. A plot dictates what
*will* happen; a situation establishes what *is* happening and lets play
decide the outcome.

## The insight: most of this machinery already exists — it's just not wired to the plan

The campaign-plan *layer* is beat-linear, but the rest of the engine is
already situation/clock-oriented. Phase 5 is mostly **connective**, not
net-new subsystems:

| Framework from the critique | Already in the codebase |
|---|---|
| **Progress Clocks** (Blades) | `CountdownTimer` (`manage_timer`, `autoAdvance`, `visibility`, `status`) — `structs.ts:596`; `SceneChallenge` is even commented "progress clock" |
| **Fronts / doom tracks** (PbtA) | `StoryThread` already carries a "Front/clock wrapper (Blades-style)": `linkedTimerId` + `threshold` + `priority: "main"|"side"|"background"` — `structs.ts:1166`. Built, and currently **unused by the plan.** |
| **Threat escalation (Step 1→2→3)** | A `CountdownTimer` with `autoAdvance` + the director's `announce_future_badness` / `tick_a_clock` moves — `structs.ts:1103` |
| **Time / consequence triggers** | `selectDirectorMove()` already fires PbtA moves deterministically |
| **Floating clues / secrets** | the notes / lore / secrets + memory systems |
| **Player-facing objectives** | `Goal` — `structs.ts:502` |
| **Session summaries for re-planning** | `reflection.ts` synthesizes higher-level insights from memory batches |

So Phase 5 does **not** add a parallel faction engine. It promotes the dormant
`StoryThread` Front-wrapper into a real Fronts layer, reframes the plan's
trigger language, adds a clues list to the note template, and tightens the
session-boundary handoff. The spine stays — demoted from *track* to
*prediction*.

## Piece 1 — Demote the spine from "track" to "prediction"

Keep `campaignPlan.ts`, the `PlanState` gate, and `advance_plan` unchanged in
*mechanism*. Change what the spine *means* in the GM prompt:

- The spine is the GM's **current best guess** at where the drama is heading,
  useful mainly as a **tone/pacing target for the narrator** — not a set of
  gates the players must trip.
- It is explicitly a **prediction players can invalidate.** When play diverges
  from a predicted beat, the correct response is to *rewrite the remaining
  spine*, never to steer players back toward it.
- The gate's job is unchanged and still valuable: it stops the plan from
  falling silently behind itself (one beat ahead, always current). It enforces
  *bookkeeping discipline*, not *plot adherence* — an important distinction to
  state in the prompt so the model doesn't read the gate as "make the players
  hit this beat."

No struct or gate change here; this is prompt wording in `ai_staged.ts` plus
the `advance_plan` tool description.

## Piece 2 — Action / time triggers replace narrative advance-when

The single railroady field is the beat's `advance-when: <narrative event>`.
Replace it with the two trigger types the critique names, both of which the
engine can actually reason about:

- **Action triggers** — advance / escalate when the players *do* one of
  several things: *"advance when the players decode the broadcast **or**
  destroy the antenna."* Crucially **OR'd alternatives**, not one required
  event — this is the Three-Clue-Rule spirit applied to progression: multiple
  routes to the same state change, so no single missed action stalls the game.
- **Time triggers** — advance / escalate as a **consequence** of time passing
  or player *in*action: *"if the players spend the session ignoring the
  broadcast, the Front advances a step."* This is where Fronts (Piece 3) do
  their work — the world moves whether or not the players engage.

Template-wise, a beat's `advance-when:` line becomes an `advance-on:` block
listing action-trigger alternatives and any time-trigger. This is a
note-template + prompt change; the `PlanState` gate keys off beat *identity*,
not the trigger text, so it is unaffected.

## Piece 3 — Promote the dormant Front-wrapper into a real Fronts layer

This is the one piece with genuine (light) state plumbing. `StoryThread`
already has everything a Front needs except a place to write the escalation
steps and a convention for using it:

- A **Front** = a `StoryThread` (its `title` + `description` carry the Front's
  **motive and cast**) with `priority: "background"` (it advances off-screen)
  and a `linkedTimerId` pointing at a `CountdownTimer` that is its **doom
  clock**. The clock's `description` already documents "what happens when the
  timer reaches 0."
- **Escalation steps (Step 1→2→3)** live as a checklist in the thread's
  `description` (or a small typed `steps?: string[]` addition on `StoryThread`
  — decision below), each step tied to a clock threshold. The existing
  `threshold?` field already lets a thread mark a clock position as
  significant; multi-step needs either several thresholds or the typed array.
- **Advancing a Front is already possible**: `manage_timer` ticks the clock,
  the director's `tick_a_clock` move can drive it, and `announce_future_badness`
  telegraphs the next step. What's missing is the *convention and prompt
  guidance* that ties "Front" together as a first-class concept the GM creates
  during planning and the plan note references.

The plan note gains a **Fronts** section (see template below) that names each
active Front, its motive, its current step, and its clock. The Fronts
themselves live as `StoryThread` + `CountdownTimer` state (tool-mediated,
player-visible via the existing threads/timers UI) — the plan note only
*indexes* them, the same way it indexes threads/goals today rather than
restating them.

**Open decision (Piece 3):** typed `steps?: { text: string; atTick: number;
done: boolean }[]` on `StoryThread` vs. keeping steps as markdown in
`description`. Typed is cleaner for a future "which step is live" readout and
for the director; markdown is zero-schema-change and consistent with how the
spine keeps its own checklist in note prose. Leaning **markdown first**
(Phase 5a), typed only if a demonstrated need appears (same "don't build ahead
of need" posture as the frontier doc) — but flagging it as the main
struct-level decision to lock.

## Piece 4 — A floating-clues / secrets list (Lazy GM)

Add a **Secrets & Clues** section to the plan note: 5–10 disconnected facts the
players *could* discover, written **decoupled from how they're found.** The
prompt guidance is the load-bearing part: a clue like *"the tapes emit a
low-frequency hum"* can surface via an audiophile NPC, breaking into the
station, or examining a tape — the GM must not pre-bind it to one route. When a
clue is delivered, the GM ticks it off and (if it matters mechanically) spawns
the corresponding `Goal`/`StoryThread`. Pure note-template + prompt change.

## Piece 5 — Structured session handoff feeding `advance_plan`

This is the robustness improvement raised in the discussion, and it's the
cleanest lever in Phase 5. Today the session boundary is where `advance_plan`
`write_next` invents the next horizon, and its only structured input is the
prose in memory/reflection. `reflection.ts` currently emits a **flat list of
plain-text insight lines** (`buildReflectionPrompt`, `applyReflection`) — good
for memory recall, but the GM has to re-parse prose to figure out what
actually changed in the world before it can re-plan.

**Proposal: give the re-planning boundary a *categorized* world-state delta
instead of a prose blob**, so `advance_plan` / Front-advance get clean
parameters. Concretely, emit a small typed digest — the categories the
discussion suggested, generalized:

- **Neutralized / changed assets** — Fronts or NPCs the players defused,
  killed, allied with, or otherwise took off the board (⇒ which Fronts/clocks
  to *stop* or rewrite).
- **Ticking clocks** — Fronts/timers that advanced or are now imminent (⇒
  which escalation steps are live next horizon).
- **New / shifted goals & hooks** — objectives the players adopted or arcs that
  collapsed toward one candidate direction (⇒ what the next beat should serve).
- **Open questions the oracle should seed** — uncertain facts the next horizon
  depends on (⇒ where to call `fate_question`/`roll_table` when writing it).

Two implementation shapes, to decide at implementation time:

1. **Extend `reflection.ts`** to tag each insight with a category (smallest
   change; reflection already runs on importance-threshold batches, so the
   categories accumulate as a running delta the boundary reads). Caveat:
   reflection fires mid-session on a `REFLECTION_IMPORTANCE_THRESHOLD` batch,
   **not** on session boundaries — so this makes it a *continuous* categorized
   feed, not a per-session digest.
2. **A dedicated boundary "handoff digest"** function, a sibling to
   `reflection.ts`/`compaction.ts` (same pure-planner + prompt-builder +
   API-orchestrator shape), run when a beat/session boundary is crossed, that
   emits the typed digest above from the memories since the last boundary.

Leaning toward **(1) as Phase 5's first cut** (reuses the existing, tested
reflection pass; no new orchestration) with (2) noted as the fuller version if
the continuous feed proves too noisy to re-plan from. Either way the *output
contract* — the four categories above — is the durable part, and it is what
turns "the AI rewrites a prose outline" into "the AI updates typed world-state
that `advance_plan` reads."

## The two design questions this resolves

Both questions the critique posed have clean answers under this design, and
recording them is half the point of the doc:

**Q: What happens when players completely derail an established Front or Clock?**
Nothing routes them back. A Front is *independent state*: its clock keeps
ticking, freezes, or is removed based on what the players did to its *cause*,
not on what the spine predicted. Derailment isn't an error condition — it's the
Front reacting. If the players blow up the antenna during Step 1, the Front
doesn't limp toward Step 3; the GM **rewrites the Front's remaining steps** (or
resolves/abandons the thread) at the next boundary, exactly the way it rewrites
the spine. The structured handoff (Piece 5) is what makes this legible: a
neutralized asset is a *category*, so re-planning sees "this Front is off the
board" as data, not buried in prose.

**Q: Does the AI rewrite its vague future outline, or route players back to the
original plan?** **Rewrite — always.** The "one beat / one step ahead"
discipline already forbids scripting far out; Phase 5 extends it to Fronts. The
session/beat boundary is the re-planning point, the structured handoff is its
input, and `advance_plan write_next` (+ Front-advance) only ever writes the
*next* horizon. Routing players back toward an invalidated prediction is the
specific failure Phase 5 exists to remove.

## Session-to-session data pipeline (how it all connects)

```
   during play:  memory accrues ──▶ reflection.ts (Piece 5: categorized delta)
                                          │
   Fronts tick:  manage_timer / director tick_a_clock ──▶ clocks advance
                                          │
   at boundary:  advance_plan complete_current
                     │  reads categorized delta + current Front/clock state
                     ▼
                 advance_plan write_next  ──▶ next spine beat (prediction)
                 + rewrite/advance Fronts  ──▶ next escalation step(s)
                 + refresh candidate arcs  ──▶ collapse toward what players did
                     │
                     ▼
                 only the NEXT horizon is detailed; everything past it stays
                 one-liners. Derailed predictions are rewritten here, never
                 enforced against the players.
```

## Note template with Phase 5 sections (illustrative)

```markdown
# Campaign Plan

## Premise (1-2 sentences, stable)

## Spine  (PREDICTION, not a track — the current beat detailed, future = one-liners)
- [x] Session 0 — Opening Image: <done>
- [ ] Session 1 — Inciting Incident: <one line>
- [ ] ...

## Current beat — <name>
Goal: <what has to become true in the fiction before we advance>
- [ ] concrete checklist item
advance-on:
  - action: players decode the broadcast OR destroy the antenna
  - time: if the session ends with the broadcast ignored, Front "The Signal" ticks a step

## Fronts  (independent threats — each is a StoryThread(background) + doom clock)
### The Signal  — clock: "Rift opens" [▓▓░░░░] 2/6
Motive: <what it wants>   Cast: <key NPCs>
- Step 1: broadcast infiltrates the local forum   ← current
- Step 2: a forum member is abducted
- Step 3: the rift opens on Rodenbecker Street

## Secrets & Clues  (decoupled from HOW they're found)
- [ ] The tapes emit a low-frequency hum
- [ ] The baron secretly funds the bandits
- ...

## Character arcs  (per player; 2-3 candidate directions, not scripts)
### <Name>  — current state / candidate directions / active hooks
```

## Relationship to existing systems (do not duplicate)

- **Fronts vs. Threads:** a Front *is* a `StoryThread` (background priority +
  linked doom clock), not a new type. Ordinary threads (main/side plotlines the
  players are actively pulling on) are unchanged. The distinction is
  `priority` + whether a doom clock is attached and advancing off-screen.
- **Fronts vs. the spine:** the spine is *authorial prediction about drama*;
  Fronts are *world state that advances regardless of drama*. They coexist —
  the spine predicts how the players' collision with the Fronts will feel; the
  Fronts don't care whether that prediction holds.
- **Fronts vs. the director:** the director still picks the per-turn move;
  Fronts give `tick_a_clock` / `announce_future_badness` a concrete thing to
  advance and telegraph. No director-policy change required for Phase 5a.
- **Clues vs. Goals/Threads:** a clue is latent information; when discovered and
  it matters, it *spawns* a `Goal` or `StoryThread`. The clue list is not a
  second objective tracker.

## Phased sub-plan for Phase 5

- **Phase 5a — prompt + template + Front convention (done):**
  - [x] Reframe the spine as a "prediction, not a track" in the CAMPAIGN PLAN
        prompt section and the `advance_plan` tool description — `ai_staged.ts`,
        `toolSchemas.ts`.
  - [x] Replace `advance-when` with an `advance-on` action/time-trigger block
        in the note template + prompt guidance — `ai_staged.ts` (both the
        CAMPAIGN PLAN section and the per-turn plan injection).
  - [x] Add **Fronts** and **Secrets & Clues** sections to the plan guidance,
        with Fronts built as `create_thread` (priority "background") +
        `manage_timer` doom clock and clues floated decoupled from route —
        `ai_staged.ts`.
  - [x] Guidance tying `manage_timer` to Front escalation steps (steps as
        markdown in the thread description for 5a — no `StoryThread` schema
        change).
  - [x] Tests — `tests/gmPlanNotes.test.ts`: prompt asserts the prediction
        framing + `advance-on` + Three-Clue Rule, and the Fronts (doom clock /
        escalation steps / `create_thread` / `manage_timer`) + Secrets & Clues
        sections. Existing plan/regression suites still green.
- **Phase 5b — structured handoff (Piece 5), option (1):**
  - [x] Extend `reflection.ts` to tag insights that are world-state changes
        with `[Neutralized]` / `[Clock]` / `[Goal]` / `[Arc]`, leaving ordinary
        pattern insights untagged; the tags ride the existing flat-string
        memory entries (no parsing/storage change — the strip regex leaves a
        leading `[` intact).
  - [x] `advance_plan` (write_next) description tells the GM to ground the next
        beat in recent `[Neutralized]/[Clock]/[Goal]/[Arc]` insights + current
        Fronts/clocks — `toolSchemas.ts`.
  - [x] Tests — `tests/reflection.test.ts`: a tagged-insight round-trip
        confirming `[Neutralized]`/`[Clock]` prefixes survive and a `- ` before
        a tag is still cleaned off.
- **Phase 5c — deferred until a demonstrated need:**
  - [ ] Typed `steps?` on `StoryThread` (Piece 3 open decision) and/or a
        dedicated boundary digest function (Piece 5 option 2). Not built — 5a's
        markdown steps and 5b's continuous tagged feed cover the need for now.

## Decisions to lock before implementing Phase 5

- **Keep the spine, demoted to prediction** — locked (per this discussion).
- **Doc-first, implement after review** — locked (this document).
- **Fronts reuse `StoryThread` + `CountdownTimer`, not a new struct** —
  proposed; the only open struct question is typed `steps?` vs. markdown
  (leaning markdown for 5a).
- **Structured handoff = extend `reflection.ts` with categories (option 1)**
  vs. dedicated boundary digest (option 2) — proposed option 1 first.
- **Trigger reframe: `advance-when` → OR'd action triggers + time triggers** —
  proposed.
