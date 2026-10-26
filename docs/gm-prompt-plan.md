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

### 2026-10-25, slice 3

- **Block order** (`buildSessionZeroBlock`): header and checklist (with "What to
  do next is the last line of this block"), the step list, then the reference
  (the system's creation rules note, the setup reference, the sheet template,
  and C3's campaign guide, which carries C5's starter-review wording), then the
  RULE line, the mode lines and the asking rules (`creationRules(mode)`), the
  quick-mode nudge, and last the one next-step pair: `setupNextStep` plus
  `creationNextStep` (the step to ask, or the all-covered line, unchanged text).
  `creationRules` no longer takes `progress` or `shipped`; the next-step half
  moved to the new `creationNextStep`. The "below" pointers in the next-step
  and mode texts now say "above".
- **The batching rule** is one bullet, "Batching, by scope". The mode lines no
  longer restate it. The model is no longer told to set `allow_custom`.
- **`CreationStep.kind`** is optional (Codex's revision, default `"choice"`,
  read through `stepKind`) but set on every step in the repository. Creative:
  cohort, setting, tone, style, tone_safety, campaign, campaign_review,
  name_look, history, drives; every Fantastic Realms step; Blood & Bone's vow,
  connections and gear. Choice: abilities and Blood & Bone's kind, archetype,
  stats, burden, power and path.
- **`prepareSetupQuestions`** (exported from `gmExecutor.ts`, run by
  `executeAskQuestion` in session zero, both modes) sets `allow_custom: true` on
  an item tagged with a creative step; in full mode it refuses the call, before
  the player is asked, when the **first item under a known tag** has no `intro`.
  Untagged items and unknown tags are never touched or refused (an untagged
  clarifying question counts for nothing anyway), and only the first item per tag
  needs an intro, since `history` asks three questions under one tag. A refusal
  is `success: false`, so the setup gate treats it as no progress.
- **Existing tests** updated deliberately: `gmTools.setupStep` and
  `generation.setupDetail` now send an `intro` (full mode requires it);
  `sessionZeroBlock*` match the new batching and allow_custom wording.
- **The behavioural case** is `evals/generation/setup-full-one-player-step-per-call.json`
  (generation format, `published: false` until the author reads it); G2's runner
  was not on master, so it is only parsed by a test. It adds an `expectArguments`
  key the format does not define; the runner must read it.

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

### 2026-10-25, slice 2 (G2)

Built on `claude/gm-prompts-g2`. Files: `app/misc/gmPromptChains.ts` (new),
`ai_staged.ts`, `gmTools.ts`, `judges/generationEval.ts` (new), `judges/evalFormat.ts`,
`scripts/eval-generation.mjs`, `evals/generation/` (eight cases), `evals/README.md`,
`tests/gmPrompt.chains.test.ts`.

- **The roll chain and the cache rule.** `rollDecisionChain()` takes no tool name;
  it says "your roll tool (named under YOUR ROLL TOOL in the live state)". The live
  block gains `## 🎲 YOUR ROLL TOOL` from `buildRollToolSection(story)`
  (`feat_roll`, `action_roll`, `ask_for_roll` in Manual Dice Mode, else
  `formula_roll`), a story-level choice. The system prompt is byte-identical for
  Blood & Bone, Fantastic Realms and no system (tested). The section precedes the
  combat state in the live block, so every story's live block changed.
- **The agency chain is the judge's `AGENCY_CHAIN` verbatim**, framed as "run this
  check on your draft". Its steps 1 and 4 still carry judge wording ("severity is
  none", "violation"); I kept one text rather than fork it, as the plan asks. If
  the cases show the GM misreading it, a GM-framed copy is the fix.
- **The thinking rule is in the player-turn message, not the system prompt.** The
  system prompt must not vary by model, and `usesNativeReasoning` varies by tier,
  so the system prompt says only that a `<thinking>` block, when the turn message
  asks for one, is the exception to "everything is shown". The turn message asks
  for one only when `usesNativeReasoning` is false (the flag that already gates the
  prefill).
- **The acknowledgement is "Ready."** `GM_STAGE_AFFIRMATION` (the prefill) is
  unchanged.
- **Cut:** CORE STANCE (its agency, dice, oracle and "keep it short" items), the old
  PLAYER AGENCY bullets, the "Routine actions" bullet, the closing restatement, the
  "ALWAYS start with <thinking>" lines. The Combat & Mechanics how-to lines stay,
  with `formula_roll` replaced by "your roll tool" where they meant the player's
  roll. The campaign plan's "manufactured certainty" reference now points at step 3.
- **The `stakes` description** is "Consequence on failure. high or deadly lasts the
  scene and raises the model tier." A longer version put the default tool list over
  10,000 tokens; this one holds `tests/toolBudget.test.ts`.
- **System prompt size** (default story, `estimateTokens`): 6,713 tokens before,
  6,508 after.
- **Digests retaken** in `tests/campaign.oldSaves.test.ts`: the system prompt, the
  acknowledgement and the last user message; the other twelve are unchanged.
  `tests/oracleRecency.test.ts`'s CORE STANCE test now checks the chain.
- **The generation runner.** `generationEval.ts` builds the GM's real request with
  `buildGMStagePrompt`, calls `callSideModel`, answers tool calls from
  `scriptedToolResponses` (`{ tool, result }`, never executed) and runs at most four
  rounds. It scores `expect` (`calls`, `callsAny`, `noCalls`, `proseMatching`,
  `proseNotMatching`, `narrationExcludes`) and `expectArguments` (G3's session-zero
  case). It reads `evals/generation/` only. Gates, tiers and the Observer are not
  run, so a case measures the GM's own rounds; it samples at the GM's base
  temperature (0.4 plus the chaos delta). The agency cases are checked by patterns,
  not by the agency judge.
- **Owed before merge: the baseline-then-compare measurement.** No model was
  called. Commands are in `docs/pending_tests.md`.

### 2026-10-25, slice 4

- **There is no person setting.** The only control is `storytellerMode` (`dm`
  says second person already). The person rule therefore lives in the fixed
  `NARRATOR_SYSTEM_PROMPT` (second person by default; a style note naming another
  person, or the tense and person of "Earlier in the story", wins) and the
  continuation prompt repeats it for Narrator mode; DM mode gained only the
  perception clause. Narrator mode used to name no person at all.
- **Perception and the hidden-text case are in the system message**, which is
  constant, so the stable block and the cache stay byte-identical
  (`tests/gmPrompt.narration.test.ts`). The GM request is untouched.
- **The behavioural case** is `evals/generation/narration-hidden-note-stays-out.json`,
  not `evals/turns/public/`, because that folder is the judge set (30 to 50
  judge turns, a test counts them). A generation fixture's `expect` only had
  `calls` and `noCalls`; the case adds `expect.narrationExcludes` (phrases the
  narration must not contain) with `noCalls: []`. The format type in
  `evalFormat.ts` was not edited (G2 owns the runner); the runner must read the
  new key. The live run is owed (`docs/pending_tests.md`).
- **Player notes (coordinator's fix).** `story.player_notes` (Settings default
  notes, copied into each story) now joins the narration context's stable block
  under "The player's own style notes (these override your defaults for person,
  tense and style)", through `stripHiddenLoreContent`; the system message says
  they override the default person. `author_notes` (the Designer's private GM
  notes) are deliberately not carried. Rewrites get both, as they continue the
  same context.

### 2026-10-25, slice 5 (G5)

Built on `claude/gm-prompts-g5`. Files: `ai_staged.ts`, `gmTools.ts`,
`systems/types.ts`, `systems/blood-and-bone/turnEndChecks.ts`, `turnEndChecks.ts`,
`judges/turnEndJudge.ts` (new), `generation.ts`, `evals/dawn/cases.json`,
`scripts/eval-dawn.mjs`, `tests/turnEndJudge.test.ts`,
`tests/generation.turnEndJudge.test.ts`, `tests/dawnCases.test.ts`.

- **Length.** Each bracket now names beats and sentences ("one beat, 1-2
  sentences (roughly 15-45 words)"; climax at most three beats), and the "Cut the
  flavor" section has a second example pair (a second beat nobody asked for).
  The system prompt's digest in `campaign.oldSaves` was retaken (26,373 to 27,021
  characters), for every story.
- **`set_reasoning_tier`** lists its triggers (boss or multi-sided fight 2-3, an
  unsettled rules clash 2, NPC goals colliding 2, a pivotal plot or secret decision
  3, never ordinary narration). The two parameter descriptions were shortened
  ("0 lightest, 3 heaviest."; "One line: why.") to hold the 10,000-token default
  budget and the 11,500 Fantastic Realms budget.
- **The dawn question is not a judge in the Observer's combined call.** The
  revised plan puts the reading before the final round's narration, where the
  turn-end checks run; the combined call runs after the turn. So the judge is its
  own small call (`askTurnEndJudge`), the same kind (side-agent model, explicit
  effort, temperature 0, reasoning before the keyed verdict, a quote that must be
  in the text, anything else unknown), not a ninth `JudgeId`: that would have added
  a Settings flag type, a stored setting and a preconditions branch for a
  system-declared check. It is one extra side call per distinct final prose,
  cached per turn, and only for a system that declares a `judge` trigger and only
  when the switch is on.
- **The trigger.** `SystemTurnEndCheck.trigger` gained `kind?: "phrases"|"judge"`
  (unset means phrases) and `question?`. The phrase table stays on a judge check
  as the fallback. `pendingCheck` takes `judged`; `judgeChecksToAsk` lists the
  checks to read (none when off, prompted, satisfied, suppressed by the previous
  turn or with no text).
- **Ships dark.** `isTurnEndJudgeEnabled()` reads localStorage `ys:turnEndJudge`
  (`"on"`), default off, no Settings control, until the live run passes. With it
  off the behaviour is byte for byte today's, which the existing
  `generation.turnEndChecks` tests still prove.
- **The behavioural cases** are `evals/dawn/cases.json` (13: five dawns, eight
  non-dawns, among them a flashback, a plan, a question, a "before dawn", a
  painting of a sunrise). They are not generation fixtures (no GM round to run) nor
  judge turns (`evals/turns/public/` is counted by a test), so they have their own
  tiny format and runner, `scripts/eval-dawn.mjs`, which prints the phrase table's
  verdict for each (free) and, with `--go`, asks the judge N times and scores
  missed and false dawns against the table, counting an unknown as the table's
  answer. The phrase table is wrong on 6 of the 13 (three missed dawns, three
  false), pinned by `tests/dawnCases.test.ts`. The live run is owed.
- **Not done:** no Settings control for the switch, and the judge reads Blood &
  Bone's check only (the only system with a turn-end check).

### 2026-10-26, slice 5 after engine review

- **No pointless call.** The judge is not asked when fewer than three rounds
  remain (`MAX_GM_ROUNDS - gmRound < 3`), the same bar the reminder itself has; the
  phrase result then feeds the log line.
- **One reading per check per turn** (the judge plan's ceiling,
  `judge-layer-v2-plan.md:246`): a `Set` of asked ids replaces the per-text cache.
  After one reading (yes, no or unknown) the phrase table decides the rest of the
  turn. CLAUDE.md said "per distinct prose" and was corrected.
- **Unknown, not no.** The judge's prompt answers "unknown" for a text that does
  not settle it, which falls back to the phrase table; a false "no" would mean
  `end_session` never runs. `scripts/eval-dawn.mjs` now reports missed and false
  dawns apart and fails on any rise in missed dawns (missed weighted 3 to 1).
- **Known gap: no timeout.** Side calls have no timeout in this codebase, so a
  hung dawn call stalls the turn until the player stops it. The revisions' "fails
  or times out" is met for failure only; a timeout system is a separate change.
- **Tool budget headroom:** the default tool list is now 9,997 of 10,000 tokens
  (3 of headroom); the next tool text must make room first.

