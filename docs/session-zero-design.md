# Campaign setup that actually sets up — design

Status: **approved (decision 147), being built.** The implementation plan
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
     it back to the next unfinished step, up to twice a turn. After that the
     turn ends with "(Let's finish setting up first: next is …)", never with
     story narration.
   - A rejected reply is never shown to you, sent to guests or read aloud.
   - If it tries to start the story before the sheet, the plan and your OK
     exist, `start_game` refuses and names what is missing.
   - Editing the sheet or the plan after your OK cancels the OK, so you
     approve what actually starts.

## 3. How

### 3.1 One setup state, kept by the engine

`StoryData.setup` (optional; absent on old saves and outside session zero):

```ts
interface SetupState {
  mode?: "quick" | "full";      // chosen by the player (§3.2)
  conceptDone?: boolean;        // see below
  approval?: {                  // the player pressed "Start the story" (§3.5)
    sheetHash: string;          // of the sheet note(s) the card showed
    planHash: string;           // of the plan note the card showed
  };
  referenceTitles?: string[];   // notes read during setup, newest first (§3.4)
}
```

The steps are **derived** from live state. `getSetupProgress(story)` in
`campaignPlan.ts` computes them:

| step | done when |
|---|---|
| Concept | `mode` is set, and either `conceptDone` (a setup question was answered) or a sheet already exists (a pre-made character or an old save) |
| Character | each player who needs one has a populated, enabled `character_sheet` note. That is one for solo play; in couch co-op or party mode, one per player, matched by `ownerCouchPlayerId` or a "Character: <name>" title. |
| Campaign | an existing, enabled `gm_plan` note. A stale `planState` with no note does not count during setup. |
| Approved | `approval` is set **and** its hashes match the current sheet(s) and plan. Any later edit cancels the approval (Codex's review). |
| Started | `sessionZeroActive` is false |

`getSetupProgress` also names the **next step**. The block, the gate, the
checklist, `confirm_setup` and `start_game` all read it.

### 3.2 Choosing the style

A new story in session zero with no `setup.mode` opens on a **style
choice**: two buttons in the checklist strip, "Quick setup" and "Step by
step".

- A tap sets `setup.mode` and sends the player line ("Let's do a quick
  setup." / "Let's build my character step by step."). Both happen in **one
  host-owned callback**, so the state and the turn cannot disagree.
- Typing instead means quick mode.
- Online guests and party phones see the strip read-only, without the
  buttons.

### 3.3 One setup block, not three

During session zero, one live-block section, `buildSessionZeroBlock(story)`,
replaces the FRESH STORY block, START OF PLAY and the setup reminders. It
holds:

- the checklist (✓ / → / ·);
- the next step, with the exact tools to use;
- the rule: until `start_game`, you never narrate the story; every turn
  either asks the player (`ask_question`), does a setup step or calls
  `confirm_setup`, and a short out-of-character line is fine;
- the mode's four lines;
- the sheet template;
- the setup reference (§3.4);
- after 6 setup questions, a nudge to propose.

It sits in the live block (the cache rule). The old blocks stay for a story
outside session zero that lacks a sheet or a plan.

### 3.4 What setup needs stays in view, without touching history

The first draft kept setup-time `read_notes` results whole in history.
Codex showed that changes bytes of earlier history when setup ends, and
grows without bound, so it is dropped. **History stubs are unchanged.**

Instead, what setup needs rides in the session-zero block, which is per-turn
by nature:

- **The system's creation rules** (`BuiltinSystem.creationNoteId`; Blood &
  Bone's `builtin:blood-and-bone:character-creation`), in full, only if the
  story holds that note and it is enabled.
- **The setup reference:** the notes the GM read during setup, newest
  first, up to `SETUP_REFERENCE_CAP_TOKENS`.
  - The cap is about 6,000 tokens; the plan measures it against the whole
    request.
  - `setup.referenceTitles` is updated by `read_notes` during session zero.
  - Each title appears once, and the creation note is not counted twice.
  - A note too large for what is left is listed by title with the usual
    "read it again" line.
- **The sheet template:** the story's own `characterSheetTemplate` if it
  has one (an explicit template always wins), else the resolved system's
  `sheetTemplate`.

At `start_game` the block, the reference and the creation rules leave the
request. Nothing in history moves.

### 3.5 The OK before the start: `confirm_setup`

`confirm_setup({ character_summary, campaign_hook })` pauses the turn like
`ask_question`.

- **It refuses** without the sheet(s) or the plan, and names which.
- **The card shows the current text.** The executor works on a clone, so
  the card's sheet and plan come from that working copy, passed with the
  request, not from page state (Codex's review).
- **Start the story** stores `approval` with the hashes of exactly what the
  card showed.
- **Change something…** returns the player's note. Any edit the GM then
  makes cancels the approval through the hashes.
- **Dismiss is not Stop.**
  - Dismissing the card returns "The player closed the card; ask what they
    want to change."
  - **Stop** cancels the turn. The executor checks the turn's abort signal
    after the pause and **commits nothing**, so Stop's restore of the
    pre-turn story is not overwritten by a batch finishing afterwards
    (Codex's review). Later tools in the batch, `start_game` included, do
    not run.
- **Who answers the card:**
  - couch co-op: the shared screen;
  - party mode: the table;
  - online: the host.

  The card is not relayed to phones or guests.

**`start_game`** refuses unless Character, Campaign and **Approved** all
hold on the live state, and names what is missing. Its success result
carries the intro instructions (decision 144).

### 3.6 The setup gate, and what the player sees

**When a setup turn may end.** A session-zero turn may end only when, this
turn:
- the player **answered a question**; or
- a **setup step advanced** (a sheet or plan written or changed, or
  approval given); or
- **`start_game` succeeded**.

These are judged from the tool *results* of this turn's rounds, not from
whether a tool was called, so unrelated or failed tools do not count
(Codex's review). A turn that reaches its final, tool-less round without any
of these is a violation.

**On a violation,** the GM is re-prompted with the next step and its tool:
- `tool_choice: "required"` is set where the provider allows it. Providers
  that reject a forced choice (Claude via OpenRouter, Qwen, Z.ai) get the
  message only.
- This happens up to **2** times (`MAX_SETUP_PROMPTS`).
- **It does not fail open.** After the cap, the turn ends with an engine
  line in the GM's voice, "(Let's finish setting up first: next is
  <step>.)", with no narration and no story continuation.
- The round-limit fallback is blocked from narrating as well.
- When approval is given but `start_game` has not been called, the next
  step is `start_game`, and the gate asks for exactly that.

**The other gates.** The roll gate (M2) and the plan gate are suspended
while `sessionZeroActive`, up to and including the round that calls
`start_game`. They apply again from the next turn. The setup gate keeps its
own counter.

**No narration stage during setup.** While `sessionZeroActive`, and unless
`start_game` succeeded this turn, the story-continuation stage does not run.
The turn's text is setup talk, saved as the GM's turn as usual.

**What the player sees.** During setup the GM's text is **buffered**. It
reaches the timeline, online guests and read-aloud only when the turn ends
validly, so a rejected round's prose is never shown, sent or spoken (Codex's
review). It is also removed from the turn's accumulated narration and replay
history. The cost: no live streaming during setup, whose replies are short.

**Cost.** Session zero already pins every turn to the top tier
(`hardRuleFloor`: Sonnet at xhigh by default). The plan budgets a whole
request across setup's rounds and turns (tools, the block, the reference)
and records the figure. Changing the tier rule is not part of this work. If
the figure is high, that is the author's call.

### 3.7 Multi-select questions (decision 146)

- **The tool.** `ask_question`'s question items gain `multi_select?: boolean`.
  `ask_question` and `confirm_setup` both join the Google tool list, which
  lacks `ask_question` today.
- **The modal** shows checkboxes and a Done button when it is set, plus the
  free-text box when `allow_custom`.
- **The answer** item gains `selectedLabels?: string[]`, and the result
  text lists every pick.
- **Party phones** need every transport step changed explicitly: the
  protocol serialisation, the phone's parse and the host's cleaning of an
  answer. Each of these drops the flag or the array today (Codex). Couch
  `target_player_name` routing is unchanged. Single-choice stays the
  default.

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
  pre-made character arrives with its sheet, so Concept and Character are
  already ticked once a style is chosen, and setup goes on to Campaign and
  the card.
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
- **Token cost.** The setup reference is capped and leaves at
  `start_game`. The plan measures a whole setup.
- **Providers that reject a forced tool choice** (Claude via OpenRouter,
  Qwen, Z.ai). For them the gate relies on its message, as the M2 gate
  already does.
- **Live checks.** Whether GLM 5.3 follows this end to end is a real-model
  run, which needs the author's go. It goes in `pending_tests.md`.
