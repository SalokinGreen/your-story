# A step-by-step setup that is actually step by step — design and plan

Status: **draft, revised after Codex's review (§6), waiting for the author's
approval.** It extends [`session-zero-design.md`](session-zero-design.md)
(decisions 142–147) with decision 148. Design and plan are in one document
because this is a follow-up on an approved flow, and the plan section names
the files.

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

1. **The table** (couch or party only): why you are together, from Blood &
   Bone's Step Zero. Asked once, for the whole table.
2. **The world:** where the story is set, the **tone** (multi-select:
   horror, intrigue, action, romance, tragedy…) and **the kind of
   campaign**: what you want to face, and how long.
3. **The character, through the system's own steps**, for each player in
   turn. For Blood & Bone:
   - Kind, then Archetype;
   - stats;
   - the Vow;
   - two connections, each with its rank and why it still matters;
   - a burden, or none (and its benefit if you take one);
   - a Power, a Path, then gear and resources.
   Starting Stress is a rule, not a choice: the GM tells you it (2, or 1
   with a burden's benefit) and does not ask.
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

**The checklist** counts the build: "Setup 7/17" (§3.6 gives the count), so
you can see how far along you are.

**The card cannot open until every step is covered.** If the GM tries,
`confirm_setup` refuses and names the missing steps, and the GM is sent to
ask the next one.

**Quick setup** stays quick: 2–4 questions, then a proposal. It now always
includes the setting and the tone, the two things the export shows the GM
deciding alone.

**Pressing Start starts the story.** The engine starts the game itself, and
the briefing and the opening scene follow in the same turn. You never type
"Let's go".

**A setup turn never re-shows old text.** Before the game starts you see
only the GM's latest words, and the GM carries on to the next step rather
than stopping on an empty reply.

## 3. How

### 3.1 Creation steps, defined once

- **The type.** `app/misc/setupSteps.ts` defines `CreationStep`. (The name
  `SetupStep` is taken: it is the coarse workflow step in `campaignPlan.ts`.)
  ```ts
  interface CreationStep {
    id: string;                       // "kind", "connections"…
    label: string;                    // "Kind", "Connections"
    group: "table" | "world" | "character" | "self";
    scope: "table" | "player";        // asked once, or once per player
    hint: string;                     // one line: what to ask, what it needs
  }
  ```
  `table` and `world` steps are scope `table`; `character` and `self` steps
  are scope `player`.
- **The universal steps,** for every story, in order:
  - `cohort` (table; only with two or more players);
  - `setting`, `tone`, `campaign` (world);
  - `name_look`, `history`, `drives` (self, after the system's steps).
- **The system's steps.** `BuiltinSystem.creationSteps?: CreationStep[]`
  (`systems/types.ts`). For Blood & Bone (`blood-and-bone/index.ts`), split
  so one tag means one choice:
  `kind`, `archetype`, `stats`, `vow`, `connections` (both, with ranks and
  reasons), `burden` ("none" counts), `power`, `path`, `gear`.
  Stress is not a step; the hint for `burden` says to state the starting
  Stress. Blood & Bone's Step 8 is the universal `name_look` and `history`.
- **A story with no system** gets one generic step, `abilities` ("what they
  can do, from the mechanics note"), **only if** it has an enabled
  `mechanics` note. A fiction-only story has no system step.
- **`getCreationSteps(story)`** returns the ordered list for the story.
  **Required** depends on the mode:
  - full mode: every step;
  - quick mode: only `setting` and `tone`.

### 3.2 Recording what was asked

- `ask_question` items gain **`setup_step?: string`**. One stable schema:
  a free string, validated by the executor, never a per-story enum (the tool
  list must not change between stories or turns).
- **Coverage is per player for player steps** (Codex 3):
  `SetupState.covered?: { table: string[]; players: Record<string, string[]> }`,
  keyed by the same player ids `getSetupProgress` already uses (couch ids,
  party seat ids; solo is `"solo"`).
- `executeAskQuestion` records a step only when:
  - the id is one of the story's creation steps (an unknown tag is
    ignored, and the result says so);
  - the question was **answered**, not skipped;
  - for a player step, the answer came from a player the engine can name:
    the question's target (couch `target_player_name`, party routing) or,
    solo, `"solo"`. A table step must be asked untargeted on the shared
    screen; in party mode an untargeted question goes to the spotlight
    holder (`partyRuntime.targetFor`), so table steps are recorded for the
    table whoever answers.
  - **one step per call** (Codex 4): a call whose items carry two different
    tags records none of them, and the result tells the GM to ask one step
    at a time. Several items with the same tag (the three background
    questions) are one step, recorded when all of them are answered.
- **What the engine cannot know.** It checks that a step was asked and
  answered under its tag, not that the question was a good one. The prompt
  carries the hint for each step; playtesting checks the rest. The plan does
  not claim more than that.
- **The tool result names the progress** (Codex 6): "Recorded: connections
  (Nik). Next: burden (Nik)." The live block is built once per turn, so the
  result is how the GM sees progress between rounds.

### 3.3 The progress and the gate

- `getSetupProgress` gains
  `creation: { covered: number; total: number; missing: { step: CreationStep; player?: string }[] }`
  and a new coarse step, **`interview`**, placed before `character`:
  `next` is `interview` while required steps are missing. So the gate's
  re-prompt (`setupGateMessage`) and the engine line (`setupEngineLine`)
  name the next step to ask, and never push `confirm_setup` early (Codex 6).
- Concept counts as done once the first step is covered.
- **`confirm_setup`** refuses while a required step is missing ("Not yet:
  you haven't asked Nik about connections, burden, history"). The refusal is
  not progress, so the gate's counter goes up as now.

### 3.4 Richer questions

- `ask_question` items gain **`intro?: string`**: a short explanation shown
  above the options in the modal and on party phones.
- **The session-zero block** (`buildSessionZeroBlock`) lists the steps with
  ✓/→ marks per player, the next missing step with its hint, and the rules.
  **Both modes** get the tagging rule, since quick mode requires tagged
  setting and tone (Codex 7). Full mode adds:
  - one step per call (several questions under one tag are fine);
  - always give an `intro`, and options whose descriptions say what the
    choice does in play;
  - for creative steps, 2–4 suggestions and `allow_custom`.
- **The question nudge.** In full mode the 6-question nudge to propose is
  replaced by "every step is covered: write the sheet and the plan". Quick
  mode keeps the nudge at 6.
- **The tool budget.** The two new fields' descriptions are short;
  `toolBudget.test.ts` holds them, and a new test checks the tool list is
  byte-identical in quick mode, full mode and after `start_game`.

### 3.5 Start means start

- `confirm_setup` gains **`story_name`** and **`premise`**. When the player
  presses Start, `executeConfirmSetup` stores the approval, then runs
  `executeStartGame` on the same working copy with those values.
- **One result per call.** `generation.ts` matches results to calls by
  position, so the start's output goes into the `confirm_setup` result, not a
  second result: "Approved. The game has started. Write the campaign intro
  now: …", with a trusted flag on the result, `started: true` (Codex 1).
- **`generation.ts` reads that flag** wherever it reads a successful
  `start_game` today: it sets `startGameSucceededThisTurn`, which releases
  the buffering, turns the narration stage back on, and stops the setup gate.
  The flag is set by the executor, never parsed from text.
- If the start itself fails (a sheet edited away between the card and the
  click, which the hashes already guard), the result says approved but not
  started, and names what is missing; the gate carries on as now.
- `start_game` stays a tool, for a GM that calls it directly.

### 3.6 Only the latest words, until the start

- **Before `start_game` succeeds**, a session-zero turn's shown text is the
  **latest round's text only**. Earlier rounds' prose stays in the GM's own
  conversation. The same boundary applies to everything that takes the
  turn's text: the final content, `gmThinking`, live narration and
  read-aloud, the online guests' callback (Codex 5).
- **At the start**, pre-start text is dropped, and from then on prose
  accumulates and streams as on any turn. The intro can therefore have
  prose before and after tool calls, as it can now.
- **An empty latest round while setup is incomplete** is not an end: the
  gate re-prompts with the next step (same counter, same cap of 2). After
  the cap, the engine line shows, never stale text.
- **Except after the card was dismissed or sent back** (Codex 9). A
  `confirm_setup` that ended `dismissed` or `changes` means the player has
  the floor: an empty round then ends the turn on the engine's own line
  ("What would you like to change?"), and the card is not forced open again.
- **Retry.** The precomputed-results path picks the latest round, not the
  last tool-less message, and is covered by its own test.
- **The count in the strip.** Total = required table steps once + required
  player steps × players. Solo Blood & Bone full mode: 3 world + 9 system + 3
  self = **15**; a couch of two: 1 cohort + 3 world + 12 × 2 = **28**.
  Quick mode shows the old four-item checklist.

### 3.7 Not in this plan

- **Online guests receive the whole story** (status report §6.12):
  `broadcastSnapshot` sends `withLegacyGuestShim(storyData)`, GM secrets
  included. That is an existing bug, not one this change creates or makes
  worse; the fix is its own PR. Party phones keep the redaction boundary:
  `intro` is added to `PartyRequestView` in `party/protocol.ts` and
  `partyHost.ts` only, and `party.redaction.test.ts` gets a case for it.

## 4. Plan

One PR, `claude/session-zero-detail`, in **two** slices (Codex 10: the old
slices 1 and 2 depended on each other). `engine-review` runs on slice 1.
Every slice ends with `tsc` clean and the suite green.

### Slice 1 — The engine and the turn

- New `app/misc/setupSteps.ts`: `CreationStep`, the universal steps,
  `getCreationSteps(story)`, `creationTotal(story, players)`.
- `app/misc/systems/types.ts` and `blood-and-bone/index.ts`:
  `creationSteps`.
- `structs.ts`: `SetupState.covered?`; `ensureStoryDataArrays` leaves it
  absent (absent means nothing covered).
- `campaignPlan.ts`: `getSetupProgress().creation`, the `interview` step,
  `setupGateMessage` and `setupEngineLine` for it.
- `gmTools.ts`: `setup_step` and `intro` on `ask_question` items;
  `story_name` and `premise` on `confirm_setup`.
- `gmExecutor.ts`:
  - `executeAskQuestion` validates and records steps (§3.2), and names the
    progress in its result;
  - `executeConfirmSetup` refuses on missing steps, and on approval runs
    `executeStartGame` and sets `started`.
- `ai_staged.ts` `buildSessionZeroBlock`: the step list, the next step's
  hint and the rules (§3.4).
- `generation.ts`: the `started` flag (§3.5), latest-round text and the empty
  round (§3.6), the dismissal exception, the precomputed Retry path.
- **Tests:**
  - the step lists per mode, system, mechanics note and player count;
  - recording: unknown tags, skips, two tags in one call, three items under
    one tag, per-player coverage on the couch, a table step in party mode;
  - the card refusing until covered; approval starting the game;
  - the export's stale-text case: seven answers, then an empty round; the
    gate fires, no first-step text is shown, after the cap the engine line
    shows;
  - approval with auto-start: the intro streams in the same turn; an empty
    intro; Stop on the card; approval on the last allowed round;
  - dismissal then an empty round: no forced card;
  - the six places, the tool budget, the byte-identical tool list.

### Slice 2 — The screen, the phones and the docs

- `AskQuestionModal.tsx`: `intro` above the options; the modal body scrolls
  inside a bounded height so every control stays reachable with the
  keyboard open.
- The party question view: `intro`, through `PartyRequestView` only.
- `setupStrip.ts` and `SetupStrip.tsx`: "Setup n/total" in full mode.
- **Docs:** `CLAUDE.md`'s session-zero section, `pending_tests.md` (a real
  full Blood & Bone setup on the APK: every step asked, with intros and
  described options, the card opening only after, Start starting; the modal
  with a long intro and the keyboard open), and a devlog note.
- **Check:** the preview with a seeded full-mode story shows "Setup n/15"
  and a long-intro question. The APK goes to the author.

## 5. Risks

- **Length.** A full solo Blood & Bone build is about 15 questions. That is
  what "step by step" asks for. Quick setup stays for players who want it
  short.
- **A GM that tags wrongly** or skips the tag. Untagged questions count
  nothing, so the card stays shut and the gate names the missing step. The
  engine enforces that each step was asked and answered, not that it was
  asked well (§3.2).
- **Token cost.** Longer setup means more turns at the top tier (session
  zero pins tier 3). That is the price of detail. The budget test re-checks
  one request.
- **Old setups in progress** have no `covered`. A full-mode story mid-setup
  is asked the remaining steps. That is intended.

## 6. Codex's review (gpt-6.1-sol, 2026-10-23)

Kept and folded in above:

1. Auto-start never reached `startGameSucceededThisTurn` (it is set only
   from a result named `start_game`): the `started` flag, §3.5.
3. One player's answer covered a step for the whole couch: per-player
   coverage, §3.2.
4. Tags checked labels, not coverage: validated ids, one step per call, the
   Blood & Bone steps split one choice per tag, §3.1–3.2; the limit stated
   honestly.
5. "Final round only" would erase the intro's streamed prose: only until the
   start, §3.6.
6. The gate still pointed at the coarse steps and could force a refused
   card: the `interview` step and progress in the tool result, §3.2–3.3.
7. Quick mode needed tags without the rule: the rule in both modes, §3.4.
8. Steps that weren't choices (Stress) and missing parts (two connections,
   gear, the burden's benefit), and `abilities` for fiction-only stories:
   §3.1.
9. An empty reply after dismissal could reopen the card: §3.6.
10. Slice order and the modal's scrolling: two slices, §4.

Also from it: the `SetupStep` name collision (now `CreationStep`), and a
"Character n/14" count that matched nothing (now §3.6's formula).

Not taken: 2, making the online-guest redaction (§6.12) a prerequisite. It
is a real, existing bug, but this change does not touch it and does not
worsen it; it is noted in §3.7 for its own PR.
