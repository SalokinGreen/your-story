# The GM's prompts — implementation plan

**Design:** [`gm-prompt-design.md`](gm-prompt-design.md), approved ("All
three", decision 241). Decisions 238–239. Audit:
`research/gm-prompt-audit-2026-10-25.md` (findings A1–A25).

## Before slice 1

The order is the graph in [`campaign-format-plan.md`](campaign-format-plan.md),
"The order across the three plans":
- slice 1 needs Fantastic Realms (#252) only for its Fantastic Realms gate
  test;
- slices 2 and 5 need J4's runner;
- slice 3 follows campaign slice 3;
- slice 4 follows campaign slice 2.

Every slice keeps the cache rule: per-turn text only in the live block. It
holds `tests/tokenBudget.test.ts` and `tests/toolBudget.test.ts`.

## Slice 1 — truth fixes and gate messages (A2, A3, A4, A7, A15, A18, A20, A23)

All deterministic text; scripted tests only.

**`ai_staged.ts`:**
- **The note-type table** (around 2290):
  - the "always loaded" marks go;
  - one line names the pinned types from the same constant the prompt builder
    uses to pin them (`PINNED_NOTE_TYPES`, exported, read by both), so the
    text can never drift from the code;
  - `mechanics` is said to be read on demand;
  - the duplicates at around 2296 and 2341 are deleted.
- **NPCs:** "NPC summaries; read the note for more" (around 2166).
- **Fronts** (around 1779, 2324): "you tick a front's clock yourself with
  `manage_timer`". This text is replaced again when campaign slice 1 lands.
- **Thread descriptions:** passed whole (`gmTruncateDesc` is removed at
  around 2025).
- **The note-table example names:** placeholders the naming rule allows.
- **The legacy setup blocks** (around 2050–2087): the current flow only, with
  the rationale text removed.

**`generation.ts`, the M2 gate message** (around 3406). It is built by a new
`rollGateMessage(systemTools)` in `app/misc/gateMessages.ts`:
- it names `ROLL_OR_ORACLE_TOOL_NAMES ∩ offered tools`;
- it names its reference, the action the player declared this turn;
- it adds the decline arm;
- the round's tool choice changes from `"required"` to `"auto"`.

**`campaignPlan.ts`, `setupGateMessage`.** The signature becomes
`(next, creation, opts: { cause?: SetupGateCause; rejected?: string; multiPlayer?: boolean } = {})`.
The defaults keep today's text. The callers updated:
- `generation.ts` around 3351;
- `tests/setupSteps.test.ts` around 219 and 238;
- `tests/generation.setupGate.test.ts`.
- `SetupGateCause` is `"prose_question" | "prose_note" | "nothing"`, derived
  by `classifySetupRejection(round)`:
  - a question mark in the visible prose with no `ask_question` gives
    `prose_question`;
  - a sheet- or plan-shaped heading with no `create_note` gives `prose_note`.
- The rejected visible text is quoted, at most whole sentences, never cut
  mid-sentence. Code passes `multiPlayer` from `setupParticipants`.

**Tests:**
- the table text matches `PINNED_NOTE_TYPES`;
- no "always loaded" remains for a non-pinned type;
- the gate message per system (Blood & Bone names `action_roll`, Fantastic
  Realms `feat_roll`) and the decline arm;
- the tool choice is `auto`;
- each setup cause's message;
- `target_player_name` only with several players;
- an old-save snapshot of the legacy blocks.

## Slice 2 — the roll chain and the agency chain (A1, A5, A6, A10, A21)

**Baseline first:** the behavioural cases run on today's prompt and their
counts are recorded, before any edit.

**`ai_staged.ts`, the system prompt:**
- **The roll chain** (design §2.1) replaces the dice and oracle rules. It is
  built by `rollDecisionChain(systemRollTool)`, so the tool name comes from
  the resolved system.
- **The agency chain** is the constant `AGENCY_CHAIN` in
  `app/misc/judges/prompts.ts` (judge v2 slice 2), imported, so the GM and the
  judge read one text.
- **The thinking rule** is stated once, conditioned on `usesNativeReasoning`.
- **The acknowledgement** becomes "Ready."
- **The closing restatements** are cut.

**The player-turn message** reads: read, decide (point at the chain), roll,
write.

**`gmTools.ts`, the `formula_roll` `stakes` description:** each tier's effect,
and that high or deadly lasts the scene.

**Behavioural cases** (invented nouns), in the labelled set as `prompt` cases:
- roll vs narrate, two pairs;
- the oracle vs established, one pair;
- agency, "go on" vs "I attack".

Each runs 20 times on GLM 5.3 (Default) and Claude Sonnet 5.5 (Advanced).
The target counts must fall, and the others must not rise beyond noise. Every
run waits for the author's go.

## Slice 3 — session zero's block (A8, A9)

**`buildSessionZeroBlock`** reorders its output: reference first (the creation
rules, the setup reference, the sheet template), then the mode lines, then
one next-step line last. The checklist and the step list point at it.
- **The batching rule** becomes one chain by scope.
- **`allow_custom` and `intro`.** `executeAskQuestion` (`gmExecutor.ts`) fills
  in `allow_custom: true` for creative steps and refuses an item without
  `intro` in full mode, from `CreationStep.kind`. The step shape gains
  `kind: "choice"|"creative"`.

**Tests:** the block order; the fields set by code. **Behavioural:** full-mode
setup asks one player step per call (a case).

## Slice 4 — the narration prompt (A17)

`buildStoryContinuationPrompt`, which campaign slice 2 replaced with the
narration context, gains:
- the grammatical person;
- "only what the character perceives";
- the hidden-text excluded case, with an invented example.

**Test:** the prompt's contents. **Behavioural:** a turn with a hidden note in
the GM's reasoning yields narration without it.

## Slice 5 — length, tiers and the dawn check (A14, A19, A25)

- **`getLengthGuidance`:** beats and sentences, and a second example pair.
- **The `set_reasoning_tier` description:** the triggers listed.
- **The dawn check:** Blood & Bone's `night-ended` keeps its message. Its
  trigger becomes a model reading:
  - `SystemTurnEndCheck` gains `trigger.kind: "phrases"|"judge"`;
  - a `judge` trigger runs one cheap yes/no in the combined judge call ("did
    the night end in this turn's prose?"), whose answer code checks against
    `end_session`;
  - the phrase table stays as the fallback when the judge call fails;
  - it ships only after its behavioural case shows no rise in missed or false
    dawns.

## Revised after Codex's review

Codex reviewed the three plans ([`research/codex-plans-review-2026-10-25.md`](research/codex-plans-review-2026-10-25.md)). Its findings for this plan
change the slices above as follows. Where this section and a slice disagree,
this section wins.

**The roll tool's name renders in the live block** (finding 9). The system
prompt's chain says "your system's roll tool (named in the live block)". The
live block names it from the resolved system. The system prompt stays
system-independent, and the cache holds.

**`CreationStep.kind`'s construction sites** (finding 17). Slice 3 sets `kind`
on:
- the shared steps in `setupSteps.ts` (`setting`, `tone`, `campaign`,
  `name_look`, `history`, `drives`, `cohort`, `abilities`);
- Blood & Bone's steps (`blood-and-bone/creationSteps.ts`);
- Fantastic Realms' steps (`fantastic-realms/sheet.ts`);
- the test fixtures that build steps.

`kind` is optional with the default `"choice"`, so a step without it keeps
today's behaviour.

**The dawn reading runs before the final round, not after narration**
(finding 8). Slice 5's judge trigger is evaluated where the turn-end checks
run today (`generation.ts:3453`), on the GM's final prose, before narration.
- **Precedence.** It feeds `pendingCheck` as the phrase table does: the
  previous-turn suppression stays, and so do the three rounds reserved for the
  Reckoning (`:3488`).
- **The call.** It is one small Haiku call, counted in the judge plan's
  ceilings.
- **The fallback.** The phrase table is used when that call fails or times
  out.

**The behavioural cases' format** is the generation fixture in the judge plan's
revised section, with the "beyond noise" rule there.

## Checks every slice

- The full suite and tsc.
- The `engine-review` agent on slices 1 and 3 (the gates and setup are
  engine).
- The token-budget tests.
- Docs: `CLAUDE.md`'s generation and session-zero sections.
- The status report: a note on §6.15 (the prompt no longer claims rules notes
  are pinned).

## Decisions made during implementation

(Filled in as the slices land.)

### 2026-10-25, slice 1

- **`PINNED_NOTE_TYPES`** is `dm_instructions`, `character_sheet`, `gm_plan`
  (`as const`, exported from `ai_staged.ts`); `gm_notes`, an alias of
  `dm_instructions`, stays in the private list only. The table's text is
  `PINNED_TYPES_LINE`, built from the constant and exported for the test.
  `isPinnedNoteType(…, includeMechanics)` is unchanged: the GM stage still
  skips `mechanics` from the title categories because it lists them in their
  own "rules" section.
- **The "duplicates around 2296 and 2341"** were found by content, not line:
  the "Pinned types are loaded in FULL" line, "all loaded in full above" in the
  plan intro, and "game rules are in the pinned notes" in IMPORTANT BEHAVIORS
  (now says to `read_notes` the rules).
- **The setup gate's `target_player_name`** is now absent whenever `multiPlayer`
  is not set, including the default call, so "defaults keep today's text" holds
  except for that mention (the plan's later rule wins).
- **`classifySetupRejection` checks the note heading first**, then the question
  mark: a plan can hold a "?", and the more specific cause says more. Its input
  is `{ visibleText, toolNames? }`; the generation gate passes `toolNames: []`
  because a rejected round is by definition one that called no tool.
- **A rejected quote** is cut to whole sentences within 300 characters; when the
  first sentence alone is longer, nothing is quoted.
- **The M2 gate's offered tools** come from `gmBaseTools`' names, so
  `progress_roll` (a `manage_track` action, not a tool) never appears in the
  message. `ROLL_OR_ORACLE_TOOL_NAMES` is now exported from `reasoningTiers.ts`.
- **The legacy setup blocks**: the START OF PLAY block and the overdue block's
  `start_game` line are unreachable (both are blanked in session zero, which is
  the only time `sessionZeroActive` holds); they were rewritten to the current
  flow (`confirm_setup`) anyway. The now-unused `SETUP_REMINDER_URGENT_TURNS`
  import was removed from `ai_staged.ts`.
- **Existing tests** that matched the old M2 and setup-gate wording
  (`generation.setupGate`, `setupDetail`, `m2RollGate`, `claudeCli`) were
  updated to the new anchors ("This scene is contested", "Next step:"), and the
  M2 tests now expect `toolChoice` `auto` (and an unforced CLI schema).

### 2026-10-25 - engine-review fixes to slice 1

- **A decline ends the M2 gate.** A prompted round (`rollGatePromptedRound`)
  that ends with no tool call is a decline: `noToolCallPrompts` is set to the
  cap, and the round's text is taken back out of the thinking, accumulated,
  context and history stores (as the setup gate does), so the gated round's
  prose is the turn's text once. A prompted round that called other tools is not
  a decline and still gets the second prompt. The decline arm now reads "the
  turn is done: reply with nothing more, and do not repeat what you wrote".
  The tests that expected three rounds (`m2RollGate`, `setupGate`) now expect
  two.
- **Setup causes fit the next step.** `classifySetupRejection` takes `next`,
  returns `"nothing"` only for empty text and `undefined` otherwise (the default
  head). `prose_question` only for `interview`/`concept`, `prose_note` only for
  `character`/`campaign`; a heading line with a "?" is never a sheet heading.
  `next` is optional in the function (absent means no restriction); the gate
  always passes it.
- **Threads are capped.** `renderThreadsSection`: 600 characters per
  description, cut at a sentence end with "… (cut for length)" (no tool reads a
  thread back, so no pointer to one); the section is held to 2,000 tokens, main
  first, with an overflow line counting the threads left out.
- **`gm_roll`** added to `GOOGLE_ESSENTIAL_TOOLS`; `rollGateMessage` names
  `manage_track` (action `progress_roll`) when it is offered (this replaces the
  earlier note that `progress_roll` never appears).
- The `isPinnedNoteType` comments no longer say mechanics is pinned.
