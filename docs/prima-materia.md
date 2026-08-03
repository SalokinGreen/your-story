# Prima Materia

An alchemical oracle by Man Alone, produced by Dice Nest (December 2025),
adapted here as a second oracle layer alongside Mythic. Implemented in
`app/misc/primaMateria.ts`.

## ⚠️ Provenance — this is not cleared for public release

**The appendix word lists in `primaMateria.ts` are transcribed verbatim from
a commercial product we do not own, reproduced without permission.** This
was a deliberate, explicit call for the alpha, while the app is private and
unreleased. It is not a licensing position and it does not survive contact
with a public build.

What's encumbered: `DISPOSITIONS`, `ACTIONS`, `LANDMARKS`, `NAMES`,
`COMPLICATIONS`, `QUEST_PROMPTS`, `QUICK_PLUCKS` — the tables at the bottom
of the file. The keyword sets (`SOL_KEYWORDS`/`NOX_KEYWORDS`) are also
lifted from the book's Quick Reference sheet, though they're short enough
to be arguable.

What isn't: the mechanism. Three dice, twelve archetypes, six relations,
Frames, Tint, the Lens Shift state machine — systems aren't copyrightable,
and the engine works unchanged whatever happens to the table data.

Before this ships to anyone outside the project, do one of:

1. **Get permission.** Man Alone is a solo designer and the book actively
   invites people to build with the system; a licence or a revenue share is
   a real option, and the honest one. The book's own promo code suggests
   they'd rather be asked than not.
2. **Strip the tables and let users bring their own.** The ingestion path
   already exists — the OCR/PDF importer writes `type: "table"` notes and
   the notes library imports them, so a user who owns the book can load
   their copy in and the `pm_*` tables simply aren't shipped. This is the
   lowest-friction option and needs no new code, only deletions.
3. **Replace them with originally-authored equivalents.** Most expensive,
   fully unencumbered.

Option 2 is the default if nobody does anything, because it's a deletion.

## What it is

Three dice:

- **Sol** (d12) and **Nox** (d12) carry the *same* twelve archetypes:
  Fortune, Body, Knowledge, Safety, Mind, Spirit, Freedom, Nature, Calm,
  Connection, Society, Self. Sol reads them bright (Fortune = luck, timing,
  reward), Nox reads them shadowed (Fortune = gamble, debt, misfortune).
  These are not good and bad — they're the two faces a concept has.
- **Syzygy** (d6) carries six prepositions: *within, against, from, toward,
  over, between*. Grouped celestial (within/between/toward — the terms
  align) and chthonic (against/from/over — the terms are at odds).

### Why bother, when we already have Mythic

Mythic's meaning tables hand the model an untyped word pair — "Abandon /
Intrigues" — and leave it to invent both the relationship between the two
words and the layer of fiction they apply to. Prima Materia hands it
`Knowledge against Spirit`: two concepts with the operator already fixed by
the dice, a polarity on each, and a Frame chosen by the engine.

Fewer degrees of interpretive freedom is the entire point. Free
interpretation is where an LLM GM reverts to its defaults.

## The pieces, and where they live

### Portents — `roll_portent`

Three modes are implemented:

| Mode | Dice | Returns |
| --- | --- | --- |
| `peek` | 1d12 | one concept, a tonal nudge |
| `pinch` | 2d12 | two concepts, both true at once, no relation |
| `portent` | 2d12 + d6 | two concepts joined by a relation — the default |

**Pull/Pass is deliberately not implemented.** The book's fourth mode is
"roll two, discard one on gut instinct, no justification required" — a
model-picks-its-own-outcome hole, the same anti-pattern already closed for
reasoning-tier self-escalation and director-move self-selection. A model
handed a veto uses it on whatever inconveniences it. The three modes above
are safe because the engine fixes the result and the model only interprets.

The tool answers "what is actually going on here?" — a *condition*, not an
outcome. It complements rather than replaces `fate_question` (which answers
a question you already know how to ask) and `roll_table` (which gives you a
piece of content).

Portents are also rolled automatically alongside every random event, on both
the `fate_question` and scene-check paths: the Mythic action/subject pair
says what happens, the portent says what it's about. Stored on
`PendingRandomEvent.portent`.

### Frames — `selectFrame()`

Literal (physical world) / Personal (interiority) / Structural (factions and
systems). **The engine picks, not the model** — handing the model the choice
of where to stand when reading its own oracle result is the same
self-selection hole as above; it would reliably pick whichever frame let it
narrate what it already intended to.

The book's own selection rule is already a state machine, and it maps onto
state we track. Priority is most-concrete-first:

1. Combat or an active challenge → **Literal**
2. An active timer, or ≥2 open threads → **Structural**
3. Tracked NPCs in play → **Personal**
4. Otherwise → **Literal** (a stalled scene wants concrete physical detail,
   per the book)

### Tint — `AGMTState.tint`

The story's standing tonal register: Day / Neutral / Night. Starts Neutral.

`chaosFactor` and `tension` are both *intensity* dials; nothing in the
director layer tracked tonal **register**, so the GM drifted monotone and
only varied tone when tension moved. The book names the gap precisely: "in a
GM-led game, the GM naturally senses when change is needed; in solo play,
that intuition is harder to externalize." An LLM GM has the same defect for
the same reason.

A **Lens Shift** fires on doubles (both d12s showing the same archetype).
Which die is "prime" is resolved in the book by physical proximity to the
Syzygy die on the table; there's no table here, so the engine flips a fair
coin — proximity in a real toss is effectively random anyway, and this keeps
the shift outside the model's reach either way.

| From | Prime Sol | Prime Nox |
| --- | --- | --- |
| Neutral | Day | Night |
| Day | Neutral | Night |
| Night | Day | Neutral |

Deliberately keyed to the *portent* dice, not `askFate`'s d100 — that roll
already has its own doubles rule for random events, and two independent
triggers on one roll would make both harder to reason about.

Tint reaches both the GM stage (Oracle State section) and the story stage
(`buildStoryContinuationPrompt`). The story stage matters most: a register
the narrator never sees is a register that doesn't affect the words the
player reads. Neutral emits nothing, which is the common case and costs no
prompt budget.

### Pluck tables — `roll_table`, `pm_` prefix

`pm_dispositions`, `pm_actions`, `pm_complications`, `pm_quest_prompts`,
`pm_landmarks`, `pm_names`, plus one-roll oracles `pm_weather`, `pm_scale`,
`pm_time`, `pm_distance`, `pm_power`, `pm_genus`, `pm_state`, `pm_agency`,
`pm_intensity`, `pm_rate`, `pm_decision`.

These lean toward *pressure* where the existing AGMT built-ins lean toward
*scenery* — which is why `pm_complications` also now seeds the director's
two pressure moves (`announce_future_badness`, `put_someone_in_a_spot`) via
`PendingDirectorMove.complicationSeed`. The engine already decided *which*
move fires; without a seed the move's actual content was pure model
improvisation, which is where its habitual complications came from.

#### The die-face order is load-bearing

The 12×12 tables are indexed by a face order the book never states outright
— it has to be inferred from the grids. It is the Quick Reference sheet's
4×3 layout read **column-wise**:

```
Fortune, Body, Knowledge, Safety, Mind, Spirit,
Freedom, Nature, Calm, Connection, Society, Self
```

Get this wrong and nothing throws — every roll still returns a plausible
word, just the wrong one, forever. `tests/primaMateria.test.ts` pins known
cells from three separate tables against it. Don't "tidy" `ARCHETYPE_ORDER`
to match the printed sheet.

The two 6×6 tables (complications, quest prompts) print axis labels the book
never ties to any die, so they're rolled as two independent d6s rather than
inventing a mapping and quietly getting it wrong.

## Also shipped alongside: "yes, but" / "no, but"

Not Prima Materia's mechanism, but its Quick Plucks decision row (Yes / No /
Yes but / No but / Yes and / No and) exposed a real gap: `askFate` had four
outcomes, and "and" was covered by the exceptional results while "but" — the
costed success, the consolation failure — had no oracle equivalent at all.
Partial success has existed on the dice side for a long time via
`formula_roll`'s stakes and consequences; the oracle only ever spoke in
absolutes.

Each side of the target is now split into fifths, mirroring the exceptional
rule that already carved off the outermost fifth: the fifth *nearest* the
target is the qualified result.

```
1 ─── Exceptional Yes ─── Normal Yes ─── Yes, but ─┤target├─ No, but ─── Normal No ─── Exceptional No ─── 100
```

**The yes/no boundary has not moved.** Every likelihood's odds of a yes are
exactly what they were; the bands subdivide the existing ranges.
`tests/mythicFateChart.test.ts` pins this, and the qualified bands collapse
to nothing at extreme targets the same way the exceptional bands already do.

## Files touched

| File | Change |
| --- | --- |
| `app/misc/primaMateria.ts` | new — symbols, rolls, Frames, Tint, Pluck tables |
| `app/misc/structs.ts` | `AGMTState.tint`/`lastTintShiftScene`, `PendingRandomEvent.portent`, `PendingDirectorMove.complicationSeed` |
| `app/misc/gmTools.ts` | `roll_portent` schema; `roll_table` + `fate_question` descriptions |
| `app/misc/gmExecutor.ts` | `executeRollPortent`, `pm_` tables in `executeRollTable`, portent on random events |
| `app/misc/mythic.ts` | "but" bands in `askFate`/`fateThresholds`; complication seeds on pressure moves |
| `app/misc/ai_staged.ts` | Tint in both oracle sections and the story continuation prompt; portent on pending events |
| `app/misc/generation.ts` | passes the tint line to the story stage |
| `app/misc/toolExecutor.ts` | portent on scene-check events; complication seed rendering |
| `app/misc/observer.ts`, `gmToolLabels.ts` | `roll_portent` registered |
