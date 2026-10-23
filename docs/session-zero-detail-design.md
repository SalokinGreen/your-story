# A step-by-step setup that is actually step by step — design and plan

Status: **draft, waiting for the author's approval.** It extends
[`session-zero-design.md`](session-zero-design.md) (decisions 142–147) with
decision 148. Design and plan are in one document because this is a
follow-up on an approved flow, and the plan section names the files.

## 1. Why

The author played a step-by-step Blood & Bone setup on the APK and exported
the GM's context. Their verdict: "It was way too short for me at step by
step."

The export (105 messages) shows the GM asked **seven** questions: Kind,
Archetype, a stat spread, a Power, a Path, a city and a Vow. Everything else
it made up itself, unasked:
- the character's full name ("Nik" was all there was), look and
  personality;
- both connections (Frieda the fence, the sister Katja);
- burdens;
- the whole background: what Nik was before, the night he turned, who
  knows;
- the tone, the shape of the campaign, its fronts and its secrets.

Blood & Bone's creation rules have eight steps plus a group Step Zero. The
GM covered four of them. The rest were left to its discretion, because
nothing defines what "step by step" must cover.

The export also shows **two bugs** in the new flow:

1. **Stale text.** After the seventh answer, the GM's last round in that
   turn wrote nothing. A setup turn shows every non-rejected round's text,
   so the player was shown the *first* step's line again: "(Step one: what
   kind of creature is Nik? …)". They had to type "I picked" to get it
   moving.
2. **The start fumbled.** The player pressed **Start the story**. The
   approval told the GM to call `start_game`, but it wrote nothing and
   called nothing, twice. The gate ended the turn on "(Let's finish setting
   up first: next is starting the game.)", and the player had to type
   "Let's go".

## 2. What the player sees afterwards

**Step by step** becomes a real walk-through, in this order:

1. **The table** (couch or party only): why are you together, from Blood &
   Bone's Step Zero (the cohort).
2. **The world:** where the story is set, the **tone** (multi-select:
   horror, intrigue, action, romance, tragedy…) and **the kind of
   campaign**: what you want to face, and how long.
3. **The character, through the system's own steps.** For Blood & Bone that
   is:
   - Kind and Archetype;
   - stats;
   - starting Stress;
   - the Vow;
   - connections;
   - a burden;
   - Power, Path, gear and resources.
4. **Who they are:** name and look; what they were before, the moment they
   knew, and who knows; what they want and what they fear.
5. Then the GM writes the sheet and the plan from your answers, and shows
   the setup card.

**Each step is a real question:**

- it opens with a sentence or two on what you are choosing and why it
  matters;
- every option says what it means in play, mechanics and flavour;
- the creative steps (background, name, drives) offer suggestions, and your
  own words are always welcome.

**The checklist** shows progress through the build, "Character 7/14", so
you can see how far along you are.

**The card cannot open until every step is covered.** If the GM tries,
`confirm_setup` refuses and names the missing steps.

**Quick setup** stays quick: 2–4 questions, then a proposal. It now always
includes the setting and the tone, the two things the export shows the GM
deciding alone.

**Pressing Start starts the story.** The engine calls `start_game` itself,
and the briefing and the opening scene follow in the same turn. You never
type "Let's go".

**A setup turn never re-shows old text.** You see only the GM's latest
words, and the GM carries on to the next step rather than stopping on an
empty reply.

## 3. How

### 3.1 Setup steps, defined once

- **The step type.** `app/misc/setupSteps.ts` defines
  `SetupStep { id; label; group: "table" | "world" | "system" | "self"; required: boolean; hint: string }`.
  The `hint` is the one-line instruction the GM gets for that step.
- **The universal steps,** for every story:
  - `cohort` (table, required only with two or more players);
  - `setting`, `tone` and `campaign` (world);
  - `name_look`, `history` and `drives` (self).
- **The system's steps.** `BuiltinSystem.creationSteps` lists them. For
  Blood & Bone: `kind_archetype`, `stats`, `stress`, `vow`, `connections`,
  `burden` (asked, but answering "none" counts), and `power_path_gear`.
  Blood & Bone's Step 8 maps onto the universal `name_look` and `history`.
- **A story with no system** gets one generic system step,
  `abilities` ("what they can do, from the mechanics note").
- **`getSetupSteps(story)`** returns the ordered list for the story's mode:
  - full mode gets everything;
  - quick mode gets only `setting` and `tone` as required.

### 3.2 Tagging what was asked

- `ask_question` items gain **`setup_step?: string`**. During session zero
  the GM tags each question with the step it covers.
- `executeAskQuestion` records each answered, tagged step in
  `setup.stepsCovered`, with no duplicates. A skipped question does not
  count.
- **`getSetupProgress`** gains `steps: { covered; total; missing: SetupStep[] }`.
  Concept counts as done when the first step is covered. Character stays
  "the sheets exist".
- **`confirm_setup`** refuses, in full mode, while required steps are
  missing ("Not yet: you haven't asked about connections, burden, history").
  In quick mode it refuses only on `setting` or `tone`.

### 3.3 Richer questions

- `ask_question` items gain **`intro?: string`**: a short explanation shown
  above the options in the modal and on party phones.
- **The session-zero block, in full mode,** lists the steps with ✓/→ marks,
  the next uncovered step with its hint, and four rules:
  - **one step per call** (a step may hold up to 3 related questions,
    for example the three background questions);
  - **always tag** `setup_step`;
  - **always give an `intro`,** and options whose descriptions say what the
    choice does in play;
  - **for creative steps,** give 2–4 suggestions and let the player write
    their own.
- **The question budget.** The 6-question nudge to propose becomes "after
  the last required step" in full mode. In quick mode it stays at 6.
- **The tool budget.** The new fields' descriptions are short;
  `toolBudget.test.ts` holds them.

### 3.4 Start means start

- `confirm_setup` gains **`story_name`** and **`premise`**. When the player
  presses Start, the executor runs `start_game` itself, on the same working
  copy, with those values. The result reads: "The game has started. Write
  the campaign intro now: …".
- `start_game` stays a tool, for a GM that calls it directly. The gate's
  "next is start_game" step can then no longer be stranded, because
  approval and start are one action.

### 3.5 Only the latest words

- During setup, the turn's shown text is **only the final round's text**.
  Earlier rounds' prose stays in the GM's own conversation, never in the
  turn the player reads.
- If the final round is **empty** while setup is incomplete, the turn has
  not finished: the gate treats it as "continue to the next step", even
  though progress was made. It re-prompts with the next step (same counter,
  same cap). After the cap, the engine line shows, never stale text.

## 4. Plan

One PR, `claude/session-zero-detail`, in three slices. `engine-review` runs
on slices 1–2. Every slice ends with `tsc` clean and the suite green.

### Slice 1 — Steps, tagging and the card's rule

- New `app/misc/setupSteps.ts`.
- `app/misc/systems/types.ts` and `blood-and-bone/index.ts`:
  `creationSteps`.
- `structs.ts`: `SetupState.stepsCovered?: string[]`.
- `campaignPlan.ts`: `getSetupProgress().steps`.
- `gmTools.ts`: `setup_step` and `intro` on `ask_question` items;
  `story_name` and `premise` on `confirm_setup`.
- `gmExecutor.ts`:
  - `executeAskQuestion` records the tagged steps;
  - `executeConfirmSetup` refuses on missing steps, and on approval runs
    `executeStartGame` on the working copy.
- **Tests:**
  - the step lists per mode, system and player count;
  - tagging, skips and duplicates;
  - the card refusing until the steps are covered;
  - approval starting the game;
  - the drift test and the tool budget.

### Slice 2 — The block and the turn text

- `ai_staged.ts` `buildSessionZeroBlock`: the step list, the next step's
  hint and the four rules (full mode); quick mode requires setting and
  tone.
- `generation.ts`:
  - a setup turn's text is the final round's text only;
  - an empty final round with setup incomplete triggers the gate;
  - the intro after an auto-start streams as now.
- **Tests:**
  - the block in both modes, with a step list;
  - the stale-text case from the export (seven answered questions, then an
    empty round): the gate fires, no first-step text is shown, and after
    the cap the engine line shows;
  - approval with auto-start: the intro narrates in the same turn, with no
    "Let's go".

### Slice 3 — The modal, the phones, the strip and the docs

- `AskQuestionModal.tsx` and the party question view: show `intro` above
  the options. Party transport for `intro`.
- `SetupStrip.tsx`: "Character 7/14" in full mode.
- **Docs:** `CLAUDE.md`'s session-zero section, `pending_tests.md` (a real
  full Blood & Bone setup: every step asked, with intros and described
  options; the card opens only after; Start starts), and a devlog note.
- **Check:** the preview with a seeded full-mode story shows "Character
  n/14". The APK goes to the author.

## 5. Risks

- **Length.** A full Blood & Bone build is about 14 questions. That is what
  "step by step" asks for. Quick setup stays for players who want it short.
- **A GM that tags wrongly** or skips the tag. Untagged questions count
  nothing in full mode, so the card stays shut and the block names the
  missing steps. Tag hygiene is enforced by the gate, not trusted.
- **Token cost.** Longer setup means more turns at the top tier (session
  zero pins tier 3). That is the price of detail. The budget test re-checks
  one request.
- **Old setups in progress** have no `stepsCovered`. A full-mode story
  mid-setup is asked the remaining steps. That is intended.
