# Campaign setup that actually sets up — design

Status: **draft, waiting for the author's approval.** The implementation plan
is [`session-zero-plan.md`](session-zero-plan.md). Decisions 142–146 in
[`decisions.md`](decisions.md).

## 1. Why

The author started a freeform Blood & Bone story ("I want to play as a
vampire") and exported the GM's context. The export is the evidence for
everything below.

What the GM did:

1. **It started well.** It read the creation rules and asked three good
   questions as choices: The Ripper, Vienna, "I think I was always meant
   for this". It then rolled names for the character, the sire, a mortal
   and a theatre.
2. **It never set the story up.** It wrote no `character_sheet` note, no
   `mechanics` note and no Campaign Plan, and never called `start_game`. It
   went straight to "The gaslight has been dead in the Theater an der Wien's
   old rehearsal hall…", a scene with no character, no plan and no reason
   for being there.
3. **It forgot the rules every turn.** Each turn it re-read four to nine
   rules notes, 5,000–13,000 tokens a time, because the history keeps a stub
   in place of a past `read_notes` result ("cleared from history. Read it
   again if you need it").
4. **Complaining didn't help.** The player wrote: "Okay, this is a horrible
   campaign start, like I need a proper campaign intro." The GM answered
   "I'll build your vampire properly first" and then did the same thing
   again: it re-read the notes and narrated.

Why it could do that:

- **Nothing makes setup happen.** The FRESH STORY block, the START OF PLAY
  reminder and the setup-overdue nudge are all prompt text. `start_game`
  refuses only without a plan, and never checks for a sheet or for the
  player's agreement. Nothing re-prompts a session-zero turn that ends on
  prose. The engine has two gates that do re-prompt, the roll gate (M2) and
  the plan gate, but neither looks at setup.
- **What setup needs is wiped between turns.** `read_notes` is not among
  the tools whose results stay whole in history, and `mechanics` notes are
  listed by title only. So the creation rules the GM read last turn are a
  one-line stub this turn.
- **A freeform story with a system attached gets no sheet template.** Only
  The Hollow Hour and Designer imports set `characterSheetTemplate`.
  `buildSheetTemplateBlock` therefore printed nothing, although
  `resolveSystem` knew the story runs Blood & Bone and the system carries a
  `sheetTemplate`.
- **The setup advice is three blocks that overlap:** FRESH STORY, START OF
  PLAY and SETUP UNFINISHED/OVERDUE. None of them says plainly what the
  next step is.

## 2. What the player sees afterwards

1. **The start offers two styles** (decision 142). The first thing on a new
   story is a choice:
   - **Quick setup:** a few choices, then the GM proposes a complete
     character and hook.
   - **Step by step:** the GM walks the system's creation rules with you,
     one step at a time.

   Freeform stories, adventures with no pre-made character, and The Hollow
   Hour all start this way.
2. **A small checklist** (decision 145) sits above the composer for all of
   session zero: **Concept · Character · Campaign · Start**. Each step ticks
   as it is done. *Character* opens the sheet, and *Campaign* opens the plan,
   one tap away.
3. **Setup is a conversation in tap-able questions.** The GM asks through
   `ask_question`. Some questions now allow several answers, such as "which
   of these do you want in your story?", where you tick any number (decision
   146).
   - **Quick:** 2–4 questions, then a proposal.
   - **Step by step:** one question per creation step: Kind, Archetype,
     stats, powers, connections, background.
4. **The GM shows you what it built before the story starts** (decision
   143). A card shows the character (name, Kind, stats in a line, the hook
   of their background) and the campaign's premise. It has two buttons:
   **Start the story** and **Change something** (with a text box).
   - Nothing begins until you press Start.
   - "Change something" sends your note to the GM, which edits the sheet or
     the plan and shows the card again.
5. **The campaign intro** (decision 144) comes once you press Start:
   - a short **briefing** in the story's voice: who you are, where you are,
     what's at stake and why you are here;
   - then the **opening scene**, ending on a clear first choice.
6. **The GM cannot skip any of this** (decision 143).
   - If it tries to narrate the story before setup is done, the engine sends
     it back to the next unfinished step, up to twice a turn.
   - If it tries to start the story before the sheet, the plan and your OK
     exist, `start_game` refuses and names what is missing.

## 3. How

### 3.1 One setup state, kept by the engine

`StoryData.setup` (optional; absent on old saves and outside session zero):

```ts
interface SetupState {
  mode?: "quick" | "full";   // chosen by the player (§3.2)
  conceptDone?: boolean;     // the player answered the first setup question
  approved?: boolean;        // the player pressed "Start the story" (§3.5)
}
```

The steps are **derived**, never written twice. A new
`getSetupProgress(story)` in `campaignPlan.ts` reads each one from existing
state:

| step | done when |
|---|---|
| Concept | `setup.mode` is set and `setup.conceptDone` is true |
| Character | at least one `character_sheet` note exists |
| Campaign | `hasCampaignPlan(story)` |
| Start | `setup.approved` (and, once the game starts, `sessionZeroActive` is false) |

`getSetupProgress` also names the **next step**. Everything else reads it:
the prompt block, the gate, the checklist and `start_game`.

### 3.2 Choosing the style

A new story in session zero with no `setup.mode` opens on a **style choice**
instead of the old freeform greeting. It is two buttons in the checklist
strip: "Quick setup" and "Step by step".

- Tapping one sets `setup.mode`, and sends a short player line ("Let's do a
  quick setup." / "Let's build my character step by step.") as the first
  turn. So the GM starts knowing the mode.
- A player who just types instead gets `quick` by default. The line still
  goes to the GM.

### 3.3 One setup block, not three

FRESH STORY, START OF PLAY and the setup reminders are replaced, during
session zero, by **one** live-block section, `buildSessionZeroBlock(story)`:

- **The checklist,** with ✓ / → / · marks against the four steps.
- **The next step,** with the exact tools to use:
  - **Concept:** ask with `ask_question`. In quick mode, 2–4 questions, and
    multi-select where several answers make sense.
  - **Character:** build the sheet from the CHARACTER SHEET TEMPLATE, then
    `create_note` of type `character_sheet`. In full mode, one
    `ask_question` per creation step first.
  - **Campaign:** `read_notes`, then `create_note` of type `gm_plan`, with
    the existing plan rules.
  - **Start:** `confirm_setup` (§3.5).
- **The rule:** during session zero you never narrate the story. Every
  reply either asks the player (`ask_question`), does a setup step, or calls
  `confirm_setup`. A short out-of-character line beside a tool call is fine.
- **The mode's instructions,** quick or full, in four lines each.
- **The sheet template,** from the story's `characterSheetTemplate`, or
  otherwise the resolved system's `sheetTemplate` (§3.4).

It sits in the live block, like everything per-turn (the cache rule). The
old blocks stay for a story that is not in session zero but lacks a sheet or
a plan: an old save that started play without them.

### 3.4 What setup needs stays in view

- **The system's template.** When a story has no `characterSheetTemplate`
  but `resolveSystem` finds a built-in system, the template block uses that
  system's `sheetTemplate`. A freeform Blood & Bone story gets the Blood &
  Bone sheet.
- **The system's creation rules,** while session zero lasts. A `BuiltinSystem`
  gains `creationNoteId`, Blood & Bone's
  `builtin:blood-and-bone:character-creation`, and the session-zero block
  carries that note **in full**. It is about 2,300 tokens, measured in the
  plan. The GM no longer has to `read_notes` it each turn.
- **Notes read during session zero stay whole in history** until
  `start_game`. `renderHistoryPart` keeps `read_notes` results unstubbed in
  the parts written while `sessionZeroActive`. Session zero is a few turns,
  so this costs less than re-reading 6,000–13,000 tokens every turn, as the
  evidence shows, and the cached prefix makes it cheaper still. Once play
  starts, the stub rules apply again from the next compaction.

### 3.5 The OK before the start: `confirm_setup`

A new GM tool, `confirm_setup({ character_summary, campaign_hook })`. It
pauses the turn the way `ask_question` does:

- **The setup card.** The page shows a card with the summary and hook the GM
  wrote, a link to the sheet and the plan, and two buttons: **Start the
  story** and **Change something…** (a text box).
- **Start** sets `setup.approved = true`, and the tool returns: "Approved.
  Call start_game, then write the campaign intro: …" with the briefing and
  scene instructions of decision 144.
- **Change** returns the player's note. The GM edits and calls
  `confirm_setup` again.
- **Preconditions.** `confirm_setup` refuses if the sheet or the plan is
  missing, and names which.
- **Where the card is answered:**
  - in couch co-op, on the shared screen;
  - in party mode, on the table's screen (setup is a table decision);
  - online, by the host.
- **The six places.** The tool goes in all six places a tool lives, and the
  drift test (`gmTools.sixPlaces.test.ts`) holds it.

`start_game` gains one rule: it refuses unless `getSetupProgress` says
Character, Campaign and Start are done, and names the missing steps. Its
success result carries the intro instructions, so the briefing comes in the
same turn.

### 3.6 The setup gate

This is a third gate beside the roll gate and the plan gate, in
`generation.ts`'s round loop:

- **When it fires:** a session-zero round ends with **no tool call** (prose
  only), and setup is not complete.
- **What it does:**
  - it pushes a user message: "Setup isn't finished: next step is
    <step> — <what to call>. Don't narrate the story yet.";
  - it forces `tool_choice: "required"` for the next round (the providers
    that reject a forced choice get the message alone, as the other gates
    already do);
  - it retries.
- **Cap:** 2 per turn (`MAX_SETUP_PROMPTS`), then it fails open, as the
  others do.
- **Logging:** each firing writes a Debug Logs line.

A round that asks a question through `ask_question`, or calls any setup
tool, satisfies it. The gate does not judge what the question was. That
catches the failure in the evidence, prose instead of setup, without
policing wording.

The prose of a violating round is not shown as story. That round's text is
dropped from the turn's narration, and the retry's output is what the player
reads. The plan checks what the UI does with text already streamed.

### 3.7 Multi-select questions (decision 146)

- **The tool.** `ask_question`'s question items gain `multi_select?: boolean`.
- **The modal** shows checkboxes and a Done button when it is set, plus the
  free-text box when `allow_custom`.
- **The answer** item gains `selectedLabels?: string[]`, and the result
  text lists every pick.
- **Party phones** relay it the same way (`partyHost.offerQuestion` and the
  phone's question view). Single-choice stays the default.

### 3.8 The checklist strip

`SetupStrip` sits above the composer, beside the interrupted-turn banner and
`PartyTableStrip`, on the `ys-*` tokens. It shows while `sessionZeroActive`:

- before a style is chosen, the two style buttons;
- after that, the four steps with their ticks; Character and Campaign open
  their notes (`onOpenNote`).

It hides while a turn is loading.

## 4. What stays the same, and out of scope

- **The sheet is still written by the GM in conversation** (decision 129).
  No form returns.
- **The plan rules** stay as they are: the spine, the beats, read before
  planning.
- **Adventures with pre-made characters.** The preset picker stays. A
  pre-made character arrives with its sheet, so Character is already ticked,
  and setup goes straight to Campaign and Start.
- **Out of scope:**
  - a non-Blood & Bone system's creation note (there is none yet; the field
    is ready for one);
  - the Designer's own flow;
  - the README.

## 5. Risks

- **A GM that asks forever.** The gate accepts any question, so a GM could
  stall in questions. Quick mode's "2–4 questions, then propose" and the
  checklist keep it visible to the player. The plan adds a soft nudge in
  the session-zero block after 6 setup questions.
- **Token cost of keeping rules whole.** This is bounded by the length of
  session zero, and below the re-reads it replaces. The plan measures one
  setup in the token-budget test.
- **Providers that reject a forced tool choice** (Claude via OpenRouter,
  Qwen, Z.ai). For them the gate relies on its message, as the M2 gate
  already does.
- **Live checks.** Whether GLM 5.3 follows this end to end is a real-model
  run, which needs the author's go. It goes in `pending_tests.md`.
