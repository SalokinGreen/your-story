# The GM's prompts — implementation plan

**Design:** [`gm-prompt-design.md`](gm-prompt-design.md), approved ("All
three", decision 241). Decisions 238–239. Audit:
`research/gm-prompt-audit-2026-10-25.md` (findings A1–A25).

## Before slice 1

Slice 1 has no prerequisites beyond master. Slices 2–5 need the judge v2
labelled-set runner (judge v2 slice 4) for their behavioural cases.

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
`(next, creation, cause: SetupGateCause, rejected?: string, multiPlayer: boolean)`.
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
