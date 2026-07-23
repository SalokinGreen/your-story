# GM Plan Notes: A Rolling One-Beat-Ahead Campaign Spine

## Status

Design spec, not yet implemented. Written for review before any code changes,
per the repo's discuss-first workflow. Decision on record: **ship the
prompt-only version first (Phase 1), add a deterministic gate later (Phase 2)
only if the GM drifts.**

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
- **GM-stage only, never shown to player, never shown to the narrator.** The
  plan contains future beats and hidden arc directions; leaking it to the
  narrator stage would spoil prose and re-introduce railroading through the
  back door. Same visibility posture as `dm_instructions`.
- **Repeatable** (like `character_sheet` already is): one campaign-spine plan,
  plus optionally one arc plan per player in a co-op story. Practically, Phase
  1 uses a single note with sections; the repeatable capacity is inherent to
  the lore array and needs no extra work.

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

The beats above are a light TTRPG reframing of a standard dramatic spine
(story-circle / Save-the-Cat family). The point is a recognizable shape, not a
rigid template — the GM adapts beat names to the adventure.

## Bootstrap sequencing (matches the user's original design)

The existing `freshStorySetupBlock` (`ai_staged.ts:1307`) already nudges the GM
to create a `character_sheet` + `mechanics` note on a fresh story. Extend the
lifecycle:

1. **Setup / Session 0**: when the GM establishes character(s), it also creates
   a `gm_plan` note containing **only** the Premise + a Session-0 beat
   ("establish/create the characters"). The spine's later beats are blank
   one-liners; the arc section is empty. It does *not* plan ahead yet.
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
- Inject the pinned plan into `buildGMStagePrompt` alongside the
  character-sheet/mechanics sections; **exclude it from the narrator stage**.
- Add prompt guidance: create the plan at setup; only ever detail one beat
  ahead; tick the checklist via `edit_note`; when the current beat's
  advance-when condition is met, write the next beat before continuing.
- Extend `freshStorySetupBlock` for the Session-0 creation step.

This is contained and reversible, and it proves the concept. Its known
weakness is compliance: like any un-gated instruction, the note can drift
(GM forgets to advance, or over-writes future beats). We accept that risk for
Phase 1 and watch for it.

### Phase 2 — deterministic gate (later, only if needed)

Only build this if Phase 1 shows real drift. Shape it like the M2 gate:

- Track `planStage` (and per-beat checklist completion) as structured state,
  advanced through a small `advance_plan` tool or by piggybacking
  `increment_scene`.
- At a scene/session boundary, if the current beat is marked done but no next
  beat has been written, force a re-prompt requiring the GM to write it before
  narrating on. Non-blocking otherwise — never overrides player choice, only
  ensures the plan stays one beat ahead.

Deferred deliberately: gates add cost and can misfire (see the frontier doc's
history of reverted mechanisms), so we earn it with evidence rather than
building it speculatively.

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
- `create_note` accepts `type: "gm_plan"` and round-trips through
  `toolExecutor`.
- `freshStorySetupBlock` guidance appears only when no plan exists.
- A campaign-regression scenario (mirroring the existing one) that runs a few
  turns and asserts the plan note is created and advanced across a beat
  boundary, and that no future beat is written more than one ahead.

## Open questions for review

1. **One note or several?** Phase 1 proposes a single sectioned note. Split
   the per-player arc plans into their own `gm_plan` notes only if co-op
   sessions make one note unwieldy — defer.
2. **Beat vocabulary.** Fixed template names vs. GM-chosen beat names. Spec
   leans toward a suggested-but-adaptable spine. Confirm.
3. **Should the plan ever be player-visible** (an opt-in "campaign so far"
   view)? Currently no — GM-only. Flag if that's desired later.

## Phased implementation checklist (Phase 1)

- [ ] `LoreType` union — `app/misc/structs.ts:159`
- [ ] Pinned-type list + `isPinnedNoteType` — `ai_staged.ts:388`
- [ ] GM-stage injection block — `buildGMStagePrompt` (~`ai_staged.ts:1064`)
- [ ] Exclude from narrator/story stage
- [ ] `create_note` enum — `toolSchemas.ts:343`
- [ ] `freshStorySetupBlock` extension — `ai_staged.ts:1307`
- [ ] Prompt guidance (create / one-beat-ahead / checklist / advance-when)
- [ ] Tests per above
