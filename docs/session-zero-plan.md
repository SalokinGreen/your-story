# Campaign setup that actually sets up — implementation plan

Status: **approved (decision 147), revised after Codex's review, being
built.** Design: [`session-zero-design.md`](session-zero-design.md).
Decisions 142–146. Branch `claude/session-zero`, one PR, six slices. Line
numbers are from `master` at the merge of #233 (2026-10-23).

**Every slice ends with `tsc` clean and the suite green.** `engine-review`
runs on slices 1–4, the engine slices. The browser preview checks slice 5.
Baseline: Vitest 182 files / 2,802 tests, `tsc` clean, lint counted per
touched file.

## Slice 1 — The setup state, `confirm_setup` and `start_game`'s rule

These land together, so `start_game`'s approval rule never exists without
the tool that grants it (Codex's ordering point).

- **`app/misc/structs.ts`:**
  - `SetupState` (design §3.1): `mode`, `conceptDone`,
    `approval: { sheetHash; planHash }` and `referenceTitles`;
  - `StoryData.setup?`, optional, so no backfill is needed;
  - not in party redaction.
- **`app/misc/campaignPlan.ts`:**
  - `getSetupProgress(story, players?)`, which returns `{ concept,
    character, campaign, approved, started, next }`. `next` is one of
    `"concept" | "character" | "campaign" | "confirm" | "start_game"`, or
    `null`.
  - The rules are design §3.1's table:
    - a sheet counts if it is populated and enabled, one per required
      player (solo play needs one; couch co-op and party need one per
      player, matched by `ownerCouchPlayerId` or a "Character: <name>"
      title);
    - the plan must be an existing, enabled `gm_plan` note, so a stale
      `planState` alone does not count during setup;
    - approval holds only while its hashes match.
  - `hashNotes(notes)` is a stable string hash of the titles and contents,
    with no crypto API needed.
  - `hasCharacterSheetNote` moves here from `observer.ts:474` if that avoids
    an import cycle.
- **`confirm_setup`, in all six places:**
  - schema in `gmTools.ts`;
  - the live whitelist;
  - the executor `executeConfirmSetup` in `gmExecutor.ts`;
  - `GOOGLE_ESSENTIAL_TOOLS`, together with `ask_question`, which is missing
    there today;
  - a label;
  - the observer registration, if the drift test needs it.

  `tests/gmTools.sixPlaces.test.ts` gains explicit required-tool assertions:
  `ask_question`, `confirm_setup` and `start_game` must each be in the
  whitelist, the Google list and the labels. Today the test only checks
  that Google entries point into the whitelist.
- **What `executeConfirmSetup` does:**
  1. It refuses without the sheet(s) or the plan, naming them.
  2. It builds the card's content from the **executor's working copy** (the
     clone at `gmExecutor.ts:867`): the sheet and plan text go with the
     request.
  3. It awaits a new `requestSetupConfirmation(req)`, modelled on
     `requestPlayerAnswer`. The result is `{ approved: true }`,
     `{ approved: false, note }`, `{ dismissed: true }` or
     `{ stopped: true }`.
  4. On approval, it writes `setup.approval` with the hashes of what was
     shown.
  5. On Stop, it returns a stopped result, and the executor's batch loop
     stops (below).
- **Cancellation (Codex P1).**
  - `executeGMTools` gets the turn's abort signal through `GMToolContext`.
  - After any awaited pause (`ask_question`, `confirm_setup`, the dice
    requests) and before each later tool, it checks `signal.aborted`. If
    aborted, it returns without committing its clone and runs no further
    tools.
  - `generation.ts` (around `2839`) does not merge the batch into
    `StoryData` when the turn was aborted.
- **`executeStartGame` (`3567`):**
  - it refuses unless `character && campaign && approved` on the live state,
    naming what is missing;
  - its success text carries decision 144's intro instructions.
- **Tests:**
  - `tests/setupProgress.test.ts`: every combination, couch with two
    players, a disabled or empty sheet, a stale `planState`, hash
    invalidation after an edit, and pre-made or old-save Concept;
  - `tests/gmTools.confirmSetup.test.ts`: refusals; the card built from the
    working copy; the four outcomes; approval hashes;
  - `tests/gmTools.startGame.test.ts`: the new refusal, and the intro on
    success;
  - a cancellation test: Stop during `confirm_setup` with `start_game` later
    in the same batch commits nothing and runs nothing;
  - the drift test, with its required-tool assertions;
  - `tests/toolBudget.test.ts`.

## Slice 2 — The setup card, and the page's pause plumbing

- **`app/components/SetupConfirmModal.tsx`**, on the `ys-*` tokens, with
  `useBackHandler` (back = dismiss):
  - the summary and the hook;
  - the sheet and plan text it was given, in collapsible sections, so it
    shows the reviewed snapshot, not page state;
  - **Start the story**, and **Change something…**, which opens a text area
    with a Send button.
- **`app/story/page.tsx`:**
  - `setupConfirmRequest` state and a resolver, as for
    `askQuestionRequest`;
  - `handleStop` resolves it with `{ stopped: true }`;
  - in party mode and online play it shows on the table or host screen and
    is never relayed;
  - a guest sees "The host is reviewing the setup".
- **Tests:** the modal's pure pieces (if extracted), and the stopped
  resolution.

## Slice 3 — The session-zero block

- **`app/misc/systems/types.ts`:** `creationNoteId?`, set by Blood & Bone.
- **`app/misc/ai_staged.ts`:**
  - **`buildSessionZeroBlock(story)`** (design §3.3–3.4), in this order:
    1. the checklist from `getSetupProgress`;
    2. the next step and its tools;
    3. the no-narration rule;
    4. the mode's four lines;
    5. the template: the story's own, else the system's (an explicit
       template always wins);
    6. the creation note in full, if present and enabled;
    7. the setup reference from `setup.referenceTitles`: newest first, one
       per title, never the creation note twice, capped at
       `SETUP_REFERENCE_CAP_TOKENS`, with anything over the cap listed by
       title;
    8. the 6-question nudge. The count of `ask_question` calls answered this
       session zero is kept in `setup` as `questionsAsked` (add the field),
       not recounted from history.
  - **Placement.** It goes in the live block while `sessionZeroActive`, in
    place of `freshStorySetupBlock`, `sessionZeroStartGameReminder`,
    `setupOverdueBlock` and `buildSheetTemplateBlock`. Those keep firing
    outside session zero.
- **`read_notes` during session zero** (`gmExecutor.ts`, around `1071`)
  moves the titles to the front of `setup.referenceTitles`.
- **History stubs are untouched.**
- **Tests:**
  - the block in each step and mode;
  - template precedence (the story's own over the system's);
  - full mode carries the creation note, and quick mode carries it too when
    present, for grounding (decide and record);
  - the reference: order, dedupe, the cap, the overflow listed by title, a
    disabled note left out;
  - the block sits in the live block, and the shared-prefix check in
    `tokenBudget.test.ts` still passes, with earlier history byte-identical
    across a `start_game`;
  - a **budget test**: a full Blood & Bone setup request (system prompt,
    tools, history of three setup turns, the block) under the GM-stage
    budget. Record the figure.

## Slice 4 — The setup gate, buffering, and the other gates

- **`app/misc/generation.ts`:**
  - **Progress this turn.** Track `setupProgressThisTurn`, set from tool
    results: an answered `ask_question` (which also sets `conceptDone` and
    increments `questionsAsked`), a sheet or plan `create_note` / `edit_note`
    that succeeded, `confirm_setup` approved, or `start_game` succeeded.
  - **The gate.** At the final, tool-less round while `sessionZeroActive`,
    when `start_game` has not succeeded this turn and there was no progress
    this turn:
    - re-prompt with the next step;
    - force the tool choice where the model allows it;
    - cap at 2 (`MAX_SETUP_PROMPTS`).
  - **After the cap,** end the turn with the engine line, and do not run
    the narration or continuation stage. The round-limit path (around
    `3097–3197`) gets the same guard.
  - **Approved but not started.** When `next === "start_game"`, the gate
    message asks for exactly that.
  - **The other gates.** The M2 and plan gates (around `2978` and `3017`)
    are skipped while `sessionZeroActive`, including the round that calls
    `start_game`.
  - **No narration stage.** While `sessionZeroActive` and `start_game` has
    not succeeded this turn, there is no story-continuation call. The final
    round's text is the turn's text.
  - **Buffering (Codex P1).** While `sessionZeroActive`, `onGMContent` and
    the narration callbacks receive nothing during the turn. The final
    validated text is delivered once, at the end, to the timeline, the guest
    broadcast (`page.tsx:1145`) and read-aloud. A rejected round's text is
    removed from `allGMContextParts` and from the turn's replay history, so
    it never reaches the player, guests, read-aloud or later context.
- **Tests:** `tests/generation.setupGate.test.ts`, with the M2 and plan
  gate harness. It covers:
  - prose only: a re-prompt with a forced choice;
  - prose plus an unrelated or failed tool: still a violation;
  - an answered question: passes;
  - a full setup in one turn (sheet, plan, `confirm_setup` approved,
    `start_game`, intro) passes, and the intro narrates;
  - approved without start: asks for `start_game`;
  - the cap, then the engine line, with no narration and no continuation
    call;
  - round-limit exhaustion: no narration;
  - a forced-choice-rejecting model: the message only;
  - combat or a plan beat pending during session zero: only the setup gate
    acts;
  - buffering: no callback received a rejected round's text, the guest
    broadcast and read-aloud got only the final text, and the replay
    history carries no rejected text;
  - outside session zero: no change.

## Slice 5 — The strip, the style choice and multi-select questions

- **`app/components/SetupStrip.tsx`** (`ys-*` tokens), in `story.tsx` above
  the composer:
  - with no mode, two buttons that call a single new
    `onChooseSetupStyle(mode)`. That host-owned handler in `page.tsx`
    updates `setup.mode` and sends the player line from the **same**
    updated story object (Codex's stale-state point);
  - then the five-state checklist: Concept, Character, Campaign, Approved
    and Start, shown as four ticks plus the card. Character and Campaign
    open their notes;
  - hidden while loading;
  - read-only for guests and party phones.
- **The freeform greeting** (`localStoryManager.ts` `buildFreeformGreeting`)
  points at the two buttons. Typing first picks quick, in
  `handleCustomInput`, through the same handler.
- **Multi-select (decision 146), every transport step:**
  - `gmTools.ts`: `multi_select?: boolean` on question items, plus a line in
    the description;
  - `AskQuestionModal.tsx`: checkboxes and a Done button when it is set;
    the answer item gains `selectedLabels`;
  - `executeAskQuestion` formats every pick (`→ "A", "C"`) and drops labels
    that are not among the options;
  - party: `app/misc/party/protocol.ts` (serialise `multi_select`; parse
    `selectedLabels`, around `255`), `partyHost.ts` (offer, around `797`,
    and the answer cleaning, around `540`), and
    `app/party/PartyController.tsx`'s question view;
  - **unchanged:** couch `target_player_name` routing, and a disconnect
    falling back to the host.
- **Tests:**
  - the executor's formatting, including invalid labels and custom text;
  - the protocol round-trip;
  - the host's cleaning;
  - skip;
  - `tests/party.redaction.test.ts` still passes.
- **Check.** In the preview:
  - a freeform story shows the style buttons, and a tap shows the strip
    with quick mode set;
  - seeded notes tick the steps;
  - the setup card opens with a seeded request;
  - the multi-select modal works;
  - Ink and Paper White screenshots are taken.

## Slice 6 — Docs, and the starts

- **Starts** (Codex P2: test each, including its existing intro):
  - freeform (the greeting);
  - preset with a sheet (Concept and Character ticked once a style is
    chosen);
  - Custom;
  - a Designer adventure with starting choices (the `intro_override` wait
    still holds);
  - The Hollow Hour;
  - an old save mid-session-zero;
  - couch with two players (two sheets needed);
  - party;
  - online, as the host.

  Unit-test the pure parts. List the rest in `pending_tests.md`.
- **`CLAUDE.md`:**
  - the session-zero paragraph: the state, the block, the gate (no
    fail-open), `confirm_setup`, the card, the strip, buffering and
    multi-select;
  - `start_game`'s rule;
  - the cancellation rule;
  - `confirm_setup` added to the tool list.
- **`docs/pending_tests.md`:** a real session zero, quick and full, on the
  default ladder with Blood & Bone. That is a real model run, and needs the
  author's go. It covers:
  - expected: choices → proposal → sheet and plan → card → Start →
    briefing → scene;
  - what failure looks like;
  - the same on a phone;
  - a Claude GM;
  - couch with two players.
- **The devlog** and both docs marked built.

## What breaks, and for whom

- **A story in session zero today** gets the new flow on its next turn and
  must pass the card. This is intended.
- **Online setup turns** no longer stream live. Replies arrive whole at the
  end of each setup turn.
- **The tool list grows by one.** The budget test holds it.

## Codex's review (2026-10-23)

Codex (gpt-6.1-sol, high) found eleven problems. All were checked against
the code and taken in:

1. **The gate failed open.** It now has no fail-open: after the cap the
   turn ends with an engine line, with no narration or continuation, and
   the round-limit path has the same guard.
2. **The turn's exit rule was undefined.** The gate now judges progress
   from this turn's tool results, and approved-but-not-started has its own
   step. A setup done in one turn, with its intro, is tested.
3. **The roll and plan gates were not excluded.** Both are now suspended
   during session zero, including the `start_game` round.
4. **The approval did not match what was approved.** It is now bound to
   hashes, so edits cancel it, and the card shows the executor's working
   copy.
5. **Stop could be undone by the resumed batch.** The abort signal now
   reaches the executor, which commits nothing after a Stop, and Stop and
   dismiss are told apart.
6. **Streamed prose could not be taken back.** Setup text is now buffered
   until the turn validates, and rejected text is removed everywhere it
   would reach.
7. **The progress rules were wrong in several cases.** Concept is now
   explicit for pre-made characters and old saves, couch needs a sheet per
   player, and a stale `planState` no longer counts.
8. **The history exception broke the cache and was unbounded.** It is
   replaced by a capped setup reference in the live block, so history stays
   untouched.
9. **The cost was measured too narrowly.** A whole-request budget test is
   added, the explicit template wins, and the tier pin is recorded as
   costing more (the author's call).
10. **Multi-select needed every transport step changed.** Each step is now
    listed and tested.
11. **Tool coverage and ordering had gaps.** There are required-tool
    assertions and Google entries, `confirm_setup` lands with its rule, and
    the style choice is a single host-owned handler.

## Decisions made during implementation

(Filled in as slices land.)

### 2026-10-23, slice 1

- **Setup progress also reports `missingSheetFor`** (names of players
  without a sheet), so `confirm_setup` and `start_game` can name them.
  `getSetupProgress(story, players?)` takes the roster as a parameter
  because party seats are runtime state, not in `StoryData`;
  `GMToolContext.setupPlayers` carries it to the executors (nothing passes
  it yet; slice 2 or 4 will, for party mode). Without it, two or more
  `couchPlayers` need a sheet each, else one sheet.
- **A stale `planState` no longer allows `start_game`.** The old test
  "allows the start when planState exists but the note was deleted" now
  expects a refusal, as the plan's Campaign rule says. `hasCampaignPlan` is
  untouched (the setup reminders still use it) but `start_game` no longer
  calls it.
- **`start_game`'s rule applies whenever it is called**, not only while
  `sessionZeroActive` (the plan says "on the live state"); the prompt only
  suggests it in session zero.
- **`hasCharacterSheetNote` moved to `campaignPlan.ts`** and `observer.ts`
  re-exports it, so the observer's callers and tests are unchanged.
- **`confirm_setup` is always offered**, like `start_game`, not only in
  session zero: the tool list must stay identical turn to turn for the
  cache (a story-level flag that flips at `start_game` would not). Outside
  session zero it simply is not mentioned.
- **No observer registration** was needed (the observer has no per-tool
  list for these tools).
- **Cancellation:** `executeGMTools` returns `aborted: true` and the
  *input* story as `modifiedStoryData` (the clone is dropped); `generation.ts`
  throws the existing "Generation cancelled by user" error right after the
  call, before merging results or notifying `onGMToolResult`. It checks the
  signal before every tool and after every tool, so a Stop during any
  awaited pause (question, dice, card) stops the batch. A `stopped` answer
  from the card aborts the batch even if the signal has not yet fired.
- **Extra result type:** `GMConfirmSetupResult { outcome: approved | changes
  | dismissed | stopped | refused }`. Only `approved` is `success: true`.
- `confirm_setup` is refused with "unavailable here" when
  `requestSetupConfirmation` is absent, as the brief said, so until slice 2
  wires the page, the GM is told to ask in chat (and `start_game` stays
  blocked: setup cannot finish on the live page until slice 2 lands).

### 2026-10-23, slice 2

- **Pure pieces live in `app/misc/setupConfirmAnswer.ts`** (`SETUP_APPROVED`,
  `SETUP_DISMISSED`, `SETUP_STOPPED`, `changesAnswer`, `settleSetupResolver`),
  tested in `tests/setupConfirmAnswer.test.ts`; Stop resolves through
  `settleSetupResolver`, which is a no-op when no card is open. There is no
  DOM test setup, so the modal and the page wiring are unverified until the
  preview.
- **Wiring:** `GenerateStoryTurnCallbacks.onRequestSetupConfirmation` feeds
  `requestSetupConfirmation`, and `GenerateStoryTurnOptions.setupPlayers` feeds
  `GMToolContext.setupPlayers`. Both page call sites that run the GM pass
  them; the reword-retry call (precomputed GM results) does not run tools.
- **`setupPlayers`** is the couch players mapped to `{id, name}`: party seats
  are written into `multiplayer.couchPlayers` by `usePartyHost`, so they are
  the same list. Equivalent to the default in `getSetupProgress`; passed
  explicitly so a later change to the roster source has one place to edit.
- **Card contents:** the sheet and plan text show as plain pre-wrapped text in
  `<details>` sections (no markdown renderer is used for notes on the lore
  page's editors). Closing it (X, backdrop, Back) is `{ dismissed: true }`;
  Stop is the page's Stop button -> `{ stopped: true }`. A second request while
  one is open dismisses the first. `notifyPlayerNeeded("question", ...)` fires
  as for ask_question.
- **Party mode / online:** the card renders on the page itself (the table or
  the host's screen) and is never offered to a phone or relayed. **Guest
  "The host is reviewing the setup" indicator: skipped.** The only guest
  signal is `turn_status` (collecting/generating), which would need a
  protocol change; a guest sees the turn generating as for any paused tool.
  Add it with slice 4/5 if wanted.

### 2026-10-23, slice 3

- **`buildSessionZeroBlock(story)`** lives in `ai_staged.ts` with
  `buildSetupReference`, `SETUP_REFERENCE_CAP_TOKENS` (6,000) and
  `SETUP_QUESTION_NUDGE_AT` (6). It reaches the request through a new
  `LiveBlockInput.sessionZeroBlock`; while `sessionZeroActive`,
  `buildGMStagePrompt` passes the four older blocks empty (they are still
  built and still fire outside session zero). The checklist has five rows
  (Concept, Character, Campaign, Approval, Start); the player-facing strip
  stays four.
- **Cap rule:** notes are carried whole in newest-first order until the next
  one would pass the cap; that note and every older one are then listed by
  title ("read_notes it again if you need it"), so a small old note is not
  carried ahead of a large newer one. The count is the rendered note
  (heading included); the section's own headings add a few hundred tokens
  on top.
- **Reference skips** disabled or missing notes, the creation note, and the
  types the prompt already carries in full (`dm_instructions`,
  `character_sheet`, `gm_plan`). Hidden-visibility notes keep the
  `[[HIDDEN_LORE]]` wrapper `read_notes` uses.
- **Creation note in quick mode: carried too**, for grounding (it says what a
  legal character is); the quick-mode lines say "grounding, not a script".
  It is not a duplicate of the reference (skipped there).
- **`read_notes`:** `recordSetupReference(story, titles)` in
  `campaignPlan.ts` runs on the executor's working copy, only while
  `sessionZeroActive` and only for titles actually found; the list is capped
  at `SETUP_REFERENCE_MAX_TITLES` (20). A call's titles go in call order at
  the front.
- **Template precedence:** the story's own `characterSheetTemplate.template`,
  else the resolved system's `sheetTemplate`; shown for all of session zero,
  as before.
- **`BuiltinSystem.creationNoteId`** is set to
  `builtin:blood-and-bone:character-creation` (checked against `creation.ts`).
- **Tests changed because the old blocks no longer fire in session zero:**
  `campaignPlan.setupReminder.test.ts` (the soft/urgent cases now use a
  started story with no plan; a new case asserts the session-zero block
  replaces them) and `sheetTemplateBlock.test.ts` (the FRESH STORY line is
  checked outside session zero; one new case for the single template
  section). New file `tests/sessionZeroBlock.test.ts` (36 tests).
- **Measured, a full Blood & Bone setup request** (system prompt, the 5
  pinned-or-listed rules notes, tools, 3 setup turns of history, a sheet, the
  block with the sheet template, the creation rules in full and the six
  other rules notes as the reference): **29,439 tokens** (messages 18,425,
  tools 11,014, of which the system tools are about 1,200; the block alone
  7,871) against the 36,000 default GM-stage input budget. The reply is
  reserved separately. Round-by-round growth within a turn is the tool
  results, as for any turn.

### 2026-10-23, slice 4

- **Progress is judged from tool results, with one derived check.** An
  answered `ask_question` (`success`, i.e. not all skipped), `confirm_setup`
  approved and `start_game` succeeded read straight off `GMToolResult`. For
  sheet and plan notes, a `create_note` / `edit_note` that succeeded counts
  only if `currentSetupHashes(story)` differs before and after the batch, so a
  note of another type, an unchanged edit or a disabled note is no progress.
  `conceptDone` and `questionsAsked` (+1 per answered call, not per question)
  are written by the `ask_question` case in `executeGMTools` on the working
  copy, only while `sessionZeroActive`.
- **`sessionZeroTurn` is read once, before the round loop,** from the story as
  the turn found it. The M2 and plan gates are off for the whole turn on that
  flag (including the rounds after `start_game`, which is harmless: a fresh
  game has no combat and no plan beat pending). Buffering and the "no
  narration" rule use the live `startGameSucceededThisTurn` instead.
- **Approved this turn but not started is a violation even though approval
  counts as progress** (`setupApprovedThisTurn && next === "start_game"`): the
  approval result already told the model to call `start_game`, and prose then
  would strand the player on a finished setup. Uses the same counter.
- **Turn text stays "all non-rejected rounds' prose joined",** as outside
  session zero (the plan's "the final round's text is the turn's text" is read
  as "no separate narration call"). Prose written alongside tool calls in
  rounds that were not rejected is kept.
- **Rejection** truncates `gmThinking`, `gmAccumulatedStory`,
  `allGMContextParts` and `conversationHistory` back to marks taken when the
  round returned, so the next request and the saved `gmConversation` never
  hold it. The gate's user message stays in the model-facing history but is
  filtered from storage (as the M2 messages already are). On exhaustion (cap or
  round limit with no progress) all accumulated prose, `gmThinking` and the
  `content` of earlier assistant tool-call messages are cleared too.
- **Buffering stops at `start_game`:** the live callbacks (`onGMContent`,
  `onLiveNarrationUpdate`) are held while `sessionZeroTurn &&
  !startGameSucceededThisTurn` and stream normally after, since the intro is
  the story and no later round can be rejected. Reasoning and tool-result
  callbacks are not held. Held text reaches the player once, through the usual
  `onStoryContent` / `onStoryComplete`.
- **Engine line wording** uses a plain label per step (`setupEngineLine` in
  `campaignPlan.ts`: "a few questions about the game", "the character sheet",
  "the campaign plan", "your OK on the setup card", "starting the game"). It is
  also used when a session-zero turn without a started game ends with empty
  text after real progress (otherwise the separate narration call would run);
  it goes through the normal story-content path, so it is saved as the turn's
  text and the GM sees it next turn.
- **Forced choice:** `gmModelRejectsForcedToolChoice(modelKey)` (generation.ts)
  resolves an `AI_MODELS` key or custom UUID and calls
  `modelRejectsForcedToolChoice`. Only Qwen 3.8 is skipped here, as the plan
  says; `providerCall` still downgrades Claude and Z.ai to `auto` for every
  forced round, so those get the message plus a no-op header.
- **Not covered:** the retry path (`precomputedGMConversation`) and the
  no-user-choice first turn skip the GM loop and are untouched, so a session-
  zero retry can still run the separate narration call. Neither runs tools or
  the gate; left alone to avoid breaking an opening that has no player line.
- **Tests:** `tests/generation.setupGate.test.ts` (13). The forced-choice case
  stubs `localStorage` and sets the Advanced slot (session zero runs on tier 3)
  to Qwen 3.8 Max.
