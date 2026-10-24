# System turn-end checks, and the dawn check as the first one

Status: **design and plan, revised after Codex's review; waiting for the
author's approval.** Decisions 179–180 (the dawn gate) and 183 (house systems
with code support). Found by the 2026-10-24 playtest
(`docs/devlog/2026-10-24-playtest.md`, Codex finding 3): when the fiction
crosses into the next day, the GM (Claude Haiku) narrates the morning and never
calls `end_session`, so the Reckoning, the meter resets, the downtime offer and
"clear every used tonight" never happen. The rule is in Blood & Bone's pinned
core (§5, "The night"); sharper wording (#243) did not change it.

## 1. What the author decided

- **179, a dawn gate**: after the GM's prose, if the player's line or the GM's
  own prose this turn crossed into the next day and nothing ended the session
  this turn, the GM is sent back once.
- **180, the GM may decline**: the message says to carry on if dawn has not
  come, and never forces a tool call.
- **183, house systems with code support**: the author, on reading the first
  draft: *"I think it's a great idea to make house systems that have proper
  code support like the dawn gate or action roll. It's open source, so people
  can just make their own default systems."* So the dawn gate is not a Blood &
  Bone special case in `generation.ts`: a system **declares** it, and one
  generic engine piece runs every system's declarations. A second system
  ("the expedition returned → end_session") must need no change to
  `generation.ts`.

## 2. What it promises, honestly

The first draft promised "the Reckoning before the morning scene". It cannot:
the round that narrated the morning has already reached the feed, read-aloud
and online guests when the check runs (`generation.ts` ~2660), and ordinary
play has no way to hold prose back (only the setup gate does). So the contract
is a **follow-up reminder**: the morning stays as written, and the GM is asked,
once, to run dawn now (end the session, the Reckoning, downtime), which comes
after it in the same turn. If the Reckoning changes something the morning
already showed, the GM narrates the correction. Holding narration until
adjudication is a larger change and is not part of this.

**Coverage**: ordinary GM-loop turns only. A Retry that replays a saved
conversation, a turn with no choice, and the separate story-continuation call
can still cross dawn without the check (`generation.ts` ~2058, ~2116, ~3496);
that is stated, not fixed.

## 3. The hook: `turnEndChecks` on a system

In `app/misc/systems/types.ts`:

```ts
/** A check the engine runs when the GM ends a turn on prose (decision 183). */
export interface SystemTurnEndCheck {
  id: string;                       // "night-ended"
  /** What in this turn's text sets it off. */
  trigger: {
    /** Phrases that count in the GM's visible prose and in a player's line. */
    phrases: RegExp[];
    /** Phrases that count only in a player's line ("in the morning" is a plan in prose). */
    playerOnly?: RegExp[];
    /** Local exclusions: a match inside one of these spans does not count. */
    exceptions: RegExp[];
  };
  /** Satisfied when this turn has an executed result of this tool and type. */
  satisfiedBy: { toolName: string; resultType: string };
  /** The message sent back to the GM, conditional ("may"). */
  message: string;
}

export interface BuiltinSystem {
  // ...
  turnEndChecks?: SystemTurnEndCheck[];
}
```

Blood & Bone declares one, in `app/misc/systems/blood-and-bone/turnEndChecks.ts`:

- `id: "night-ended"`;
- `phrases`: "at dawn", "dawn breaks/broke/comes/came", "first light",
  "sunrise", "the sun rises/rose/comes up/came up", "daybreak", "next morning",
  "the next day", "the following morning", "the night passes/passed",
  "(I|we|you) (sleep|slept|go to bed|went to bed|turn in) … (until|till|through)",
  "(I|we|you) wake (up )?(the next|in the morning)", "wait (until|till) dawn";
- `playerOnly`: "in the morning", "come morning";
- `exceptions` (span-local, not whole sentences): "before dawn", "hours
  (till|until|before) dawn", "not yet dawn", "dawn is (still )?(hours|far)
  away", "tomorrow at dawn", "at dawn tomorrow", a question ("…at dawn?"),
  "remember(ed)? the next morning";
- `satisfiedBy: { toolName: "end_session", resultType: "end_session" }`;
- `message`: "The text may say the night ended this turn. If the shared
  story really has reached dawn, run dawn now as the rules say: call
  end_session, then follow the reminder it returns (the Reckoning for every
  character, downtime, clear what was used tonight), and narrate any change it
  makes to the morning. If it is not dawn yet, carry on without it."

The Reckoning wording lives in Blood & Bone's declaration and its
`endOfSessionReminder`, never in the engine.

## 4. The engine: one generic evaluator

New `app/misc/turnEndChecks.ts`, pure:

- `textCrosses(check, { gmProse, playerLines })`: matches `phrases` on the
  GM's **visible** prose of this turn (`extractVisibleText`, no `<thinking>`,
  no tool results, no history, not the reminder itself) and `phrases` plus
  `playerOnly` on **each** player line separately (a party turn's several named
  lines, `multiplayer/turnBatch.ts`, are tested one by one, so one player's
  "not yet" cannot hide another's crossing). A match inside an `exceptions`
  span on the same clause does not count; the rest of the sentence still can
  ("Before dawn we hide; at sunrise we leave" fires).
- `pendingCheck(system, turn)`: the first declared check that crossed, is not
  satisfied (no **executed** result with `result.type === satisfiedBy.resultType`
  this turn; a failed or refused call does not count) and has not been
  prompted this turn.

In `app/misc/generation.ts`, in the no-tool-call branch, after the setup, M2
and plan gates (their order unchanged):

1. Resolve the story's system (`resolveSystem`), honouring
   `usesSystemTools: false`; no system, or no `turnEndChecks`, does nothing.
2. Skip a captured session-zero turn (`sessionZeroTurn`, also after
   `start_game` succeeds that turn) and repetitive output (as M2 and plan do).
3. Skip unless the check's `satisfiedBy.toolName` is in the offered tool list
   and at least one more round is left in `maxToolLoops`; if the budget is
   spent, log "turn-end check <id> could not run: no rounds left" and end the
   turn.
4. Otherwise push the check's `message` as a user message, record the id in
   the turn's prompted set (one prompt per check per turn), set the next
   round's tool choice to an explicit **`auto`**, log the id and what matched
   (player line or prose, and the phrase), and continue the loop.

Round budget: every request counts as usual; nothing is refunded. Dawn may
need several rounds (end_session, the Reckoning rolls, the meter
adjustments, the prose); if the budget runs out partway, the turn ends there
as any turn does.

## 5. Provider: an explicit `auto`

`GenerateRequestBody.toolChoice` gains `"auto"` beside `"required"`
(`providerCall.ts`). Today an unset choice is still sent to Google as
`"required"` (`providerCall.ts` ~594), so a Google GM could not decline;
`"auto"` is honoured as auto by every provider, Google included. The other
gates keep sending `"required"`. On the subscription (`claudeCli.ts`) an
`"auto"` round keeps the schema's tool list optional (`minItems` unset), and
the "tools are down" retry does not force a call on a turn-end reminder round
(it only applies when the model claims an outage, decision 178).

## 6. What it does not do

- No time-of-day state, no clock; it reads this turn's words, and cannot tell
  two references to the same dawn across turns apart, or count two nights
  crossed in one turn. Stated, not solved.
- `end_session` resets the whole story's meters. The message asks whether the
  **shared** story reached dawn, so one character going to bed does not end
  everybody's night on its own.
- No change to `end_session` or to Blood & Bone's reminder text.
- No other hook yet. Codex's ordering of the next candidates, for later
  designs: (1) which system tools a system offers and a named, coded roll
  (`action_roll` today hard-codes d6 against two d10s, the +2 cap and B&B's
  match wording); meter sets, end-of-session reminders and creation steps
  already follow the declared pattern and stay as they are.

## 7. Files

- `app/misc/systems/types.ts`: `SystemTurnEndCheck`, `BuiltinSystem.turnEndChecks`.
- `app/misc/systems/blood-and-bone/turnEndChecks.ts` (new) and its line in
  `blood-and-bone/index.ts`.
- `app/misc/turnEndChecks.ts` (new): `textCrosses`, `pendingCheck`.
- `app/misc/generation.ts`: the evaluator call after the plan gate, the
  prompted set and the explicit `auto`.
- `app/misc/providerCall.ts`, `app/misc/claudeCli.ts`: `toolChoice: "auto"`.
- Docs: `CLAUDE.md` (the gates line and the systems section), the playtest
  devlog's status note, `docs/pending_tests.md`.

## 8. Tests

- `tests/turnEndChecks.test.ts`: the phrase lists both ways (every playtest
  line that should fire; "before dawn", "at dawn tomorrow?", "I remember the
  next morning" that should not; "Before dawn we hide; at sunrise we leave"
  that should); visible text only; each party line on its own; a second,
  synthetic system with its own check ("the expedition returned") firing
  through the same evaluator.
- A turn test in the gate tests' style (fake provider): prose crossing dawn
  then an `end_session` round (one reminder, then done); the GM declining (one
  reminder only); a failed `end_session` (still prompted, once); `end_session`
  already executed earlier in the turn (no reminder); the last round of the
  budget (logged, no reminder); after an M2 or plan re-prompt; a session-zero
  turn that calls `start_game`; a story with no system, and one with the tools
  off (nothing); the system prompt and tool list byte-identical with and
  without the reminder; the explicit `auto` reaching Google as `auto`.

## 9. Verification

The suite and `tsc`; the engine-review agent; then on the desktop app, the
playtest's Grave Watcher line ("at dawn I climb down and go to bed. Next
morning, I go find Cora"): after the morning prose, `end_session` is called
and the Reckoning rolled in the same turn.

## Decisions made during implementation (2026-10-24)

- **`textCrosses` returns the match, not a boolean**: `{ source: "prose" |
  "player", phrase, lineIndex? } | null`, so the gate's log line can say what
  matched (§4 step 4). `pendingCheck` returns `{ check, match } | null`, and
  takes `(system, { text: { gmProse, playerLines }, results, prompted })`.
  Extra exports: `checkSatisfied` and `splitPlayerLines`.
- **Where the player lines come from**: `generation.ts` has only
  `gmUserChoice`, the turn's one string. A party or online batch is
  `aggregateBatch`'s lines joined by newlines, each starting with `>`, so
  `splitPlayerLines` splits at each line that starts with `>` and keeps a
  continuation line with its player. Anything else is one line.
- **Exceptions are overlap-based**: a phrase match is dropped when any
  exception match overlaps its span. The question exception is the clause up
  to its `?` (`[^.!?
]*...\?`), so "Is it safe? At dawn we go." still fires.
- **Gate placement and the budget case**: the gate runs only when
  `resolveSystem(story).usesSystemTools` is true and the check's tool is in
  `gmBaseTools`. With `gmRound >= MAX_GM_ROUNDS` it logs "Turn-end check
  night-ended could not run: no rounds left" and the turn ends; the id is
  marked prompted either way.
- **`forceToolChoiceNextRound`** widened to `"required" | "auto"`; the
  existing request code already forwards whatever it holds.
- **Subscription**: `runRound` (`claudeCli.ts`) skips its "tools are down"
  forced retry when `body.toolChoice === "auto"`; the schema was already
  optional for anything but `"required"`.
- **Tests**: the failed-`end_session` case uses a real refusal (the tool
  needs a `reason`). The "session-zero turn that calls `start_game`" case is
  covered by the gate reading the turn-start `sessionZeroTurn` flag, which
  stays true after `start_game`; the test asserts a session-zero turn gets no
  reminder, not the `start_game` round specifically. The Google `auto` check
  is in `providerCall.forcedToolChoice.test.ts`, the subscription one in
  `claudeCli.fetch.test.ts`.
- **Devlog**: the playtest devlog's status note was not touched, as asked.

## After the engine review (2026-10-24)

- **The turn after dawn** no longer prompts: `satisfiedOnLastTurn` skips the
  check when the GM's previous turn already ran `end_session`, so "I sleep
  until dusk" cannot invite a second Reckoning for one night.
- **A decline is an empty reply**: the message asks for nothing at all when
  it is not dawn, so a false alarm adds no prose to the story.
- **The exceptions cover every word for the day**: before sunrise, you have
  until sunrise, sunrise is hours away, not until daybreak, the ship sails at
  dawn, he died the next day. The question exception is now a future question
  ("will…?") or the phrase right before its "?", bounded to 80 characters, so
  "Dawn breaks over Whitechapel, what do you do?" fires and a long
  unpunctuated run stays fast.
- **Three rounds left** are needed to send the reminder; with fewer, it is
  logged, so a session never ends without its Reckoning for lack of rounds.
- **Replay**: on the desktop build before these refinements, the playtest
  line ("At dawn I log off, climb down and go to bed. Next morning…") fired
  the check (Debug Logs: "Turn-end check night-ended… sending the GM back
  once", source player, "At dawn"), and the GM called `end_session` and rolled
  the Reckoning in the same turn.
