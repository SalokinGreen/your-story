# Campaign setup that actually sets up — implementation plan

Status: **draft, waiting for the author's approval.** Design:
[`session-zero-design.md`](session-zero-design.md). Decisions 142–146.
Branch `claude/session-zero`, one PR, six slices. Line numbers are from
`master` at the merge of #233 (2026-10-23).

**Every slice ends with `tsc` clean and the suite green.** `engine-review`
runs on slices 1–4, which are engine work. The browser preview checks
slices 5–6. The baseline is Vitest 182 files / 2,802 tests and `tsc` clean.
Lint is counted per touched file.

## Slice 1 — The setup state and `start_game`'s rule

- **`app/misc/structs.ts`:** `interface SetupState { mode?: "quick" | "full";
  conceptDone?: boolean; approved?: boolean }` and
  `StoryData.setup?: SetupState`. It is optional, so no backfill is needed.
  Add it to the party redaction's field list only if the phone needs it;
  it does not.
- **`app/misc/campaignPlan.ts`:**
  `getSetupProgress(story): { concept, character, campaign, start: boolean; next: "concept" | "character" | "campaign" | "start" | null }`,
  as in design §3.1. Character means at least one `character_sheet` note,
  using the existing `hasCharacterSheetNote` (`observer.ts:474`); move it to
  `campaignPlan.ts` if that avoids a cycle.
- **`app/misc/gmExecutor.ts` `executeStartGame` (`3567`):**
  - it refuses unless character, campaign and start are all done, naming
    the missing steps;
  - its success text carries the intro instructions (decision 144): "Now
    write the campaign intro: first a short briefing in the story's voice
    (who the player is, where, what's at stake, why they are here), then
    the opening scene ending on a clear first choice."
- **Old saves in session zero** with a sheet and a plan but no `setup`:
  `start` is false, so they get the `confirm_setup` step. That is intended.
- **Tests:**
  - `tests/setupProgress.test.ts`: every combination of the four steps, and
    `next`;
  - `tests/gmTools.startGame.test.ts`: the refusal names the missing steps,
    and success carries the intro.

## Slice 2 — `confirm_setup` and the setup card

- **The tool, in all six places:**
  - the schema in `gmTools.ts`: `confirm_setup({ character_summary: string; campaign_hook: string })`, a short description;
  - the live whitelist in `buildGMStagePrompt`;
  - `executeConfirmSetup` in `gmExecutor.ts`. It refuses without a sheet or
    a plan, naming which. Otherwise it pauses through a new
    `requestSetupConfirmation` callback, modelled exactly on
    `requestPlayerAnswer` / `executeAskQuestion` (`gmExecutor.ts:2219`),
    which returns `{ approved: true } | { approved: false; note: string } | null`.
    On approved it sets `setup.approved = true` and returns "Approved: call
    start_game now, then write the intro…". On a note it returns it. On null
    (Stop, skip) it returns "The player closed the card; ask what they want
    to change.";
  - the Google list;
  - a label ("Checking with you");
  - the observer's registration, if the drift test requires it.
- **`app/components/SetupConfirmModal.tsx`** (`ys-*` tokens; registers
  `useBackHandler`):
  - it shows the summary and the hook;
  - it links "Open the character sheet" and "Open the campaign plan" through
    `onOpenNote` and the existing note opener;
  - its buttons are **Start the story** and **Change something…** (a text
    area and Send).
- **`app/story/page.tsx`:** the pause plumbing, as for `askQuestionRequest`.
  Stop resolves it with null. Party mode and online play show it on the
  table or host screen; the request is not relayed to phones or guests.
- **Tests:**
  - `tests/gmTools.confirmSetup.test.ts`: refusals; approved sets the flag
    and the text; a note round-trips; null;
  - the drift test passes with the new tool;
  - `tests/toolBudget.test.ts` still passes (the description stays short).

## Slice 3 — The session-zero block and what stays in view

- **`app/misc/systems/types.ts`:** `BuiltinSystem.creationNoteId?: string`.
  Blood & Bone sets `builtin:blood-and-bone:character-creation`.
- **`app/misc/ai_staged.ts`:**
  - **`buildSessionZeroBlock(story, lore)`** (design §3.3): the checklist
    from `getSetupProgress`, the next step with its tools, the no-narration
    rule, and the mode's four lines. In full mode, the system's creation
    note goes in full: the story's note whose `libraryNoteId` is the
    system's `creationNoteId`, and only if the story has it. Then the sheet
    template, the soft nudge after 6 setup questions, and the
    questions-asked count, read from this session zero's history parts
    (count the `ask_question` calls).
  - **Placement.** The live block shows it while `sessionZeroActive`, in
    place of `freshStorySetupBlock`, `sessionZeroStartGameReminder`,
    `setupOverdueBlock` and `buildSheetTemplateBlock`. Those keep firing for
    a story outside session zero that lacks a sheet or a plan.
  - **The template.** `buildSheetTemplateBlock` / the new block fall back to
    `resolveSystem(story).system?.sheetTemplate` when the story has no
    `characterSheetTemplate`.
- **`app/misc/historyStubs.ts` `renderHistoryPart`:** a `read_notes`
  result in a part written during session zero stays whole. The part needs
  to know: add `ScenePart.sessionZero?: true`, set by `generation.ts` when a
  turn runs with `sessionZeroActive`. Old parts without the flag are
  unchanged.
- **Tests:**
  - the block in each step and mode;
  - the template falls back to the system's;
  - full mode carries the creation note and quick mode does not;
  - the block is in the live block, never the stable prefix
    (`tokenBudget.test.ts`'s shared-prefix check);
  - a session-zero part keeps its `read_notes` whole, and a normal part
    still stubs;
  - **measure** the session-zero block's tokens for Blood & Bone full mode
    and record the number in the plan's "Decisions made" entry.

## Slice 4 — The setup gate

- **`app/misc/generation.ts`:** beside the M2 and plan gates (`2971–3036`):
  - **When it fires:** `sessionZeroActive`, setup not complete (`next` is
    not null), and the round made no tool call.
  - **What it does:**
    - it increments `noSetupPrompts` (cap `MAX_SETUP_PROMPTS = 2`);
    - it pushes the user message naming the next step and its tool;
    - it sets `forceToolChoiceNextRound = "required"`, except for providers
      that reject it (`modelRejectsForcedToolChoice`, Claude via OpenRouter,
      Z.ai), which get the message only;
    - it logs a Debug Logs line, then `continue gmRoundLoop`.
  - **Order** against the other gates: the setup gate runs first during
    session zero, since the roll and plan gates do not apply there.
- **The violating round's prose.** Find out what happens today with the
  prose pushed to `allGMContextParts` (`2960`) and streamed by `onGMContent`
  (`2557`) when a gate retries. Make the setup gate drop that round's prose
  from the turn's story and clear it from the live narration, so the player
  reads only the retry. Record what was found.
- **`conceptDone`:** set when the first `ask_question` of session zero is
  answered (`executeAskQuestion`, when `sessionZeroActive`).
- **Tests** (`tests/generation.setupGate.test.ts`), with the same harness as
  the roll and plan gate tests:
  - a prose-only session-zero round is re-prompted with the message and the
    forced choice;
  - an `ask_question` round passes;
  - the cap of two fails open;
  - a forced-choice-rejecting model gets the message only;
  - no gate outside session zero;
  - the violating prose is not in the returned story.

## Slice 5 — The style choice, the strip, and multi-select questions

- **`app/components/SetupStrip.tsx`** (`ys-*` tokens), mounted in
  `story.tsx` above the composer, beside the interrupted-turn banner:
  - with no `setup.mode`, two buttons, "Quick setup" and "Step by step".
    Choosing one sets `setup.mode` through `onUpdateStoryData`, then sends
    the player line through `onCustomInput`;
  - after that, the four steps with ticks. Character and Campaign open
    their notes;
  - hidden while loading and outside session zero.
- **The freeform greeting** (`localStoryManager.ts` `buildFreeformGreeting`,
  `294–314`) becomes a short line pointing at the two buttons: "Pick how
  you'd like to set up, or just tell me what you're in the mood for." A
  player who types first gets `quick` (set in `handleCustomInput` when
  `sessionZeroActive && !setup?.mode`).
- **Multi-select (decision 146):**
  - `gmTools.ts`: `multi_select?: boolean` on question items, and a line in
    the description;
  - `AskQuestionModal.tsx`: checkboxes and Done when it is set; the answer
    item gains `selectedLabels`;
  - `executeAskQuestion` formats every pick: `→ "A", "C"`;
  - party mode: `app/misc/party/` (the question protocol and `partyHost`)
    and `app/party/PartyController.tsx`'s question view;
  - `tests/party.redaction.test.ts` is unaffected (questions are already
    relayed);
  - tests: modal logic (if a pure helper is extracted) and the executor
    formatting.
- **Check:** in the browser preview, a freeform story shows the style
  buttons, and choosing one shows the strip. Ticks are checked by seeding
  notes. The multi-select modal is checked with a seeded request through
  the dev path the earlier slices used. Take screenshots.

## Slice 6 — Docs

- **`CLAUDE.md`:**
  - the session-zero paragraph: the setup state, the block, the gate,
    `confirm_setup`, the strip and multi-select;
  - `start_game`'s new rule;
  - the history-stub exception;
  - the tool list gains `confirm_setup`.
- **`docs/pending_tests.md`:**
  - a real session zero on the default ladder, quick and full, with Blood &
    Bone. This is a real-model run, which needs the author's go. Expected:
    choices, a proposal, a sheet and a plan, the card, Start, and a
    briefing then a scene. Failure looks like narration before the card, or
    the gate firing twice and failing open;
  - the same on a phone;
  - a Claude GM, where the gate's message works without a forced choice.
- **`docs/status-report-2026-10-20.md`:** nothing listed there changes.
- **The devlog,** with the strip, the card and the multi-select modal.
- **Both docs** marked built.

## What breaks, and for whom

- **A story in session zero today** gets the new block and gate on its next
  turn, and must pass the card to start. Intended.
- **An old story already playing** is unaffected: it is not in session zero.
- **The tool list grows by one tool.** The budget test holds it.

## Decisions made during implementation

(Filled in as slices land.)
