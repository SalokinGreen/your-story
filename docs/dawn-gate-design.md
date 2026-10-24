# The dawn gate

Status: **design and plan, waiting for the author's approval.** Decisions
179–180. Found by the 2026-10-24 playtest (`docs/devlog/2026-10-24-playtest.md`,
Codex finding 3): when the fiction crosses into the next day, the GM (Claude
Haiku) narrates the morning and never calls `end_session`, so the Reckoning,
the meter resets, the downtime offer and "clear every used tonight" never
happen. The rule is in Blood & Bone's pinned core (§5, "The night"); a
sharper wording in #243 did not change it in the replay.

## 1. What the author decided

- **179, a dawn gate**: like the roll gate. After the GM's prose, if the
  player's line or the GM's own prose this turn crossed into the next day and
  nothing called `end_session` this turn, the GM is sent back once.
- **180, the GM may decline**: the gate's message says "if dawn has not
  actually come, carry on", and it never forces a tool call, so a false alarm
  costs at most one short extra round.

## 2. When it fires

All of these, in the no-tool-call branch of the GM loop
(`app/misc/generation.ts`, after the plan gate, ~line 3304):

1. The story runs a built-in system whose rules have a session end: the
   resolved system (`resolveSystem(story)`) uses its system tools and has an
   `endOfSessionReminder` (Blood & Bone does; a story with no system never
   gates).
2. Not a session-zero turn (`sessionZeroTurn` false). The setup turn ends on
   the intro, not on dawn.
3. No `end_session` call anywhere in this turn's rounds.
4. The dawn gate has not fired yet this turn (cap **1**,
   `MAX_DAWN_PROMPTS = 1`).
5. The text crossed into the day: `crossesDawn(text)` is true for the
   player's line, or for the turn's accumulated prose (not the GM's
   `<thinking>`).

## 3. `crossesDawn`

A pure function in a new file, `app/misc/dawnGate.ts`: phrases that put the
story in the next day, matched case-insensitively on word boundaries:

- the day arrives: "at dawn", "dawn breaks / comes / arrives", "first light",
  "sunrise", "the sun comes up / rises", "daybreak";
- the next day: "next morning", "the next day", "the following morning",
  "come morning", "in the morning" (in the player's line only: in prose it is
  too often a plan);
- sleep through: "I sleep / go to bed / turn in … until / through / till …",
  "sleep through the day", "wake up the next", "the night passes".

Never a match (checked first, and the sentence is skipped): "before dawn",
"until dawn" with "wait/hold/keep", "hours till dawn", "not yet dawn",
"dawn is (still) hours away", a dawn in quotation marks in someone's speech
about another day ("tomorrow at dawn"). A misfire is cheap by decision 180,
so the list aims to catch the real crossings the playtest showed ("at dawn I
climb down and go to bed. Next morning…"), not to be exhaustive.

## 4. The message

Pushed as a user message, the way the roll gate's is (`toolChoice` left
`auto`, decision 180):

> Dawn has come in the story (the night ended this turn). Before the day
> goes on, run dawn as the rules say: call end_session, then the Reckoning for
> each character, then offer the downtime actions. If dawn has not actually
> come yet, carry on without it.

The rejected round's prose stays (as the roll and plan gates leave theirs):
the next round's text continues after it, so the morning narration is not
written twice. The turn's text is the GM's prose plus whatever the dawn
round adds.

## 5. Files

- `app/misc/dawnGate.ts` (new): `crossesDawn(text, { playerLine })`,
  `DAWN_GATE_MESSAGE`, `MAX_DAWN_PROMPTS`. Pure, no imports from the turn.
- `app/misc/generation.ts`: the check beside the plan gate; a per-turn
  counter; a Debug Logs line when it fires (the gates log theirs); the
  `end_session`-called test reads this turn's tool calls the way the roll gate
  reads `ROLL_OR_ORACLE_TOOL_NAMES`.
- Tests: `tests/dawnGate.test.ts` (the phrase list both ways: every playtest
  line that should fire, every "before dawn" that should not) and a turn test
  in the existing gate tests' style (a fake provider: a prose round crossing
  dawn, then an `end_session` round; and the same with `end_session` already
  called, and in session zero, and in a story without a system: no re-prompt).
- Docs: `CLAUDE.md` (the gates line), the status note in the playtest devlog
  and `docs/pending_tests.md` (the replay check).

## 6. What it does not do

- No time-of-day state, no clock: the engine reads words, the GM decides.
- No change to `end_session` itself or to Blood & Bone's reminder text.
- No forcing: Claude and Z.ai get `auto` anyway (`providerCall.ts`), and
  decision 180 keeps it `auto` for every model.

## 7. Verification

The suite and `tsc`; the engine-review agent; then on the desktop app, the
same Grave Watcher line as the playtest ("at dawn I climb down and go to
bed. Next morning, I go find Cora"): `end_session` is called and the
Reckoning rolled before the morning scene.
