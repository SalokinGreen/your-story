# The GM's prompts, rewritten to the prompt rules — design

**Status:** design, for the author's review. Not approved for building.
Decisions 238–239. The audit behind it is
[`research/gm-prompt-audit-2026-10-25.md`](research/gm-prompt-audit-2026-10-25.md)
(25 findings, four checked against the code). The rules are a
prompt-engineering note by Wes Brown, which the author shared, summarised in
[`judge-layer-v2-design.md`](judge-layer-v2-design.md) §4. The judges'
prompts are that design's. This design is the GM's: its system prompt, the
blocks, the gate messages, the tool descriptions and the narration prompt.

## 1. Why

The GM's prompt grew by accretion. Each fix added a sentence beside the rule
it fixed, and the note measured that shape as the main cause of unstable
behaviour. Three kinds of damage show in the audit:
- **Rules stated as a pattern and an exemption,** so the model fires on the
  pattern first. The roll and oracle rules, the agency rule and the setup
  batching rule all have this shape.
- **The prompt telling the model something the code contradicts.**
  - Mechanics notes are called "always loaded", but they are listed by title.
  - Fronts are said to advance on their own; nothing ticks them.
  - NPCs are said to be "in full"; the GM gets summaries.
- **Gate messages that force an action without the repair.** The roll gate
  forces a call with no "nothing pending" answer, and names the wrong tools
  for Blood & Bone. The setup gate rejects a round without saying what to fix.

## 2. The changes, by area

Each change names its audit finding (A1–A25).

### 2.1 When to roll (A1, A6, A21)

One decision chain replaces the dice rule, the oracle rule and their
"this is not a contradiction" patch. It is stated once, in the system
prompt, and the player-turn message points at it instead of restating it:
1. **Read** what the player declared this turn, and the notes it touches.
2. Did the player declare an action whose failure would change the fiction?
   - YES: roll with the system's roll tool. The tool is named from the story's
     resolved system: `action_roll`, `feat_roll` or `formula_roll`.
   - NO: continue.
3. Does the turn need a world fact that the notes, the sheet and earlier
   narration do not establish?
   - YES: `fate_question` or a table.
   - NO: continue.
4. **Narrate.**

**Examples.** Two minimal pairs follow the chain:
- "I ask the bartender about the stranger" (no stake: narrate) against "I
  lie to the bartender about the stranger" (a stake: roll);
- "is it raining?" when an earlier scene established the weather (narrate)
  against when it didn't (oracle).

**Stakes.** The `stakes` field's description says what each tier does, and
that high or deadly lasts the scene and raises the model tier.

### 2.2 What the GM is told about its own context (A2, A3, A15, A18, A20)

Every claim about what the GM has in front of it is made true, once:
- **Pinned notes.** One line names the pinned types (`dm_instructions`,
  `character_sheet`, `gm_plan`) and says every other type, `mechanics`
  included, is read on demand. The table's "always loaded" marks and the
  other two statements are deleted.
- **NPCs.** "NPC summaries; read the note for more".
- **Fronts.** Until the campaign record lands, the text says the GM ticks a
  front's clock itself. Thread descriptions are passed whole. When the
  campaign record lands (`campaign-format-design.md`), the engine ticks
  clocks and the brief carries them; this text is replaced then.
- **Example names.** The note table uses placeholder titles that the naming
  rule does not forbid.

### 2.3 Agency: one chain, shared with the judge (A10)

One chain is stated once in the GM prompt, and the agency judge uses the same
chain (`judge-layer-v2-design.md` §4):
1. Is the text the declared action, or a step it plainly implies? Narrate it,
   ordinary steps included.
2. Is it new dialogue, a significant choice, a decided feeling, or the next
   action? Stop and leave it to the player.
3. Otherwise it is the world's answer. Narrate it.

**Example.** "Go on" (narrate getting there) against "I attack" (resolve the
attack, then stop).

The four other statements are deleted, including the closing restatement.

### 2.4 The gates' messages (A4, A7)

**The roll gate.** It names the tools from the set it checks
(`ROLL_OR_ORACLE_TOOL_NAMES`). It names its reference: "the action the
player declared this turn". It gets a decline arm: "if no uncertain action
was declared, reply without a roll". It is sent with `tool_choice: "auto"`,
like the turn-end checks.

**The setup gate.** It branches by cause, which code can tell apart:
- A question asked in prose: "use `ask_question` for it".
- A sheet or plan written in prose: "write it with `create_note`, type …".
- Nothing done: today's next-step line.

**The rejected text.** It is quoted back in the message, since the rejected
round is removed from history.

**`target_player_name`.** It is named only when code knows there are several
players.

### 2.5 Session zero's block (A8, A9, A23)

**Order.** Reference material comes first: the creation rules, the setup
reference, the sheet template. The single next-step line comes last, where
attention is highest. The checklist and step list point at it instead of
restating it.

**Batching.** The rule is one chain by scope:
- a table step may share a call with other table steps;
- a player step is asked alone;
- several questions under one tag are fine.

**Code sets the setup fields.** `allow_custom` and the required `intro` are
filled in by code from the step's kind, so the model is never asked to.

**The legacy blocks** (`freshStorySetupBlock`, `sessionZeroStartGameReminder`,
`setupOverdueBlock`) state the current flow only, with no rationale text.

### 2.6 Thinking and order (A5, A6)

**The thinking rule.** It is stated once, and only for models that do not
reason natively: the same flag that already skips the prefill. The fake
acknowledgement becomes a plain "Ready."

**The player-turn message.** It reads in causal order: read, decide (the §2.1
chain), roll, write. The closing restatements are cut.

### 2.7 The narration prompt (A17)

- **Person.** It names the grammatical person (second person for the player
  character).
- **Perception.** It says the narrator writes only what the player character
  perceives.
- **Hidden lore.** It gives the excluded case with an example: text marked
  hidden is never narrated.

With the allowlisted narration context (`campaign-format-design.md` §14.1),
this is the narrator's side of the hidden-lore fix.

### 2.8 Length, tiers and the dawn check (A14, A19, A25)

- **Length.** The rule is stated in beats and sentences, not word ranges,
  and code does the counting (`prospectiveLengthFlag`). A second minimal pair
  of a different shape joins the first.
- **`set_reasoning_tier`.** Its description lists the concrete triggers
  (plan-shaping calls, a single-enemy fight, deadly stakes) and drops "the task
  exceeds you".
- **The dawn check.** It moves from a phrase table to the model:
  - the turn-end message asks the GM, with its decline arm, whether the night
    ended this turn;
  - code checks only that `end_session` ran.

  It ships behind the labelled set (§3), because it changes when the
  Reckoning fires.

## 3. How the changes are tested

They are tested the note's way, by behaviour, never by their text:
- **Scripted tests** (Vitest, mock providers) check every deterministic part:
  - the gate messages' branches;
  - the tool names drawn from the resolved system;
  - code setting `allow_custom` and `intro`;
  - the block order;
  - the narration prompt's contents.
- **Behavioural cases** check the model-facing parts, in the labelled set
  (decision 229, `judge-layer-v2-design.md` §7). The parts:
  - roll or narrate, with the minimal pairs above as invented fixtures;
  - agency;
  - the setup step;
  - the dawn check.

  How they run:
  - each case runs at the shipped temperature, 20 times, on the model each
    slot ships with (GLM 5.3 for Default, Claude Sonnet 5.5 for Advanced);
  - counts are reported per case;
  - every run is on the author's key and waits for the author's go.

  Before a change ships, its target case must fall, and no other case may rise
  beyond noise.

**The cache.** The system prompt changes once, so every story's cached prefix
is rewritten once on its next turn. `tests/tokenBudget.test.ts` and
`tests/toolBudget.test.ts` hold the sizes.

## 4. Slices (for the implementation plan)

1. **Truth fixes (§2.2) and gate messages (§2.4).** These are small and
   deterministic; scripted tests only.
2. **The roll chain and the agency chain (§2.1, §2.3, §2.6).** The largest
   behavioural change. Its behavioural cases run first, as a baseline on
   today's prompt.
3. **Session zero's block (§2.5).**
4. **The narration prompt (§2.7)**, with the campaign design's narration
   context.
5. **Length, tiers and the dawn check (§2.8).**

## 5. Dependencies

- **Slice 2's agency chain** is the same text as the judge v2 agency judge;
  one constant, read by both.
- **§2.2's front text** is temporary until the campaign record lands.
- **The behavioural cases** need the labelled set's runner from judge v2
  slice 4. Until it exists, slice 1 ships on scripted tests alone, and slices
  2–5 wait for it.
