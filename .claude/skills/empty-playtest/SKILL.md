---
name: empty-playtest
description: Walk player archetypes through the actual current build to find what a system is missing. Use when the ask is "how would players react to this", "poke this system and find out what's missing", "what would a player think of X", or any request for a playtest, player reaction, or UX critique of Your Story. This is the method — do not invent a lighter version of it.
---

# The Empty Playtest

**A playtest with no players.** Walk a spread of player archetypes through the
*actual current build* and report what each hits first, what they would want,
and what would make them quit or complain.

The method exists because generic playtesting language would miss what is
distinctive about this app. "The onboarding could be smoother" is a wasted
page. Findings have to be about *these* mechanics: an AI game master that
narrates but may not decide, dice that report and never judge, a director
that picks the pacing move, freeform notes in place of a stat block, a
Designer that writes the adventure with its author, and memory that has to
carry a campaign across hundreds of turns.

## The one rule that makes it worth anything

**Every "would like / would hate" claim has to trace to a file, a formula, or
a measured figure.** Not a plausible-sounding intuition about players in
general.

- Real controls — read them off the actual components (`app/story/`,
  `app/creator/`, `app/library/`, `app/components/`) and the Settings tabs.
  Not off a design doc's intentions; many of the docs describe deleted
  systems (`docs/status-report-2026-10-20.md` §12.3 says which).
- Real numbers — from the code (a budget, a threshold, a tier's model and
  its price in `ai_prices.ts`), from a test that measures it, or from a doc
  that recorded one. Run the check; do not recall a number.
- Real behaviour of the GM — from the prompt the engine actually builds
  (`buildGMStagePrompt`, the whitelist, the tool descriptions) and what the
  executors do with each call. **Do not play turns against a real model to
  find out**: the keys are the author's own, so that needs the author's go.
- Real gaps — cited against `docs/pending_tests.md`, the status report's
  open bugs (§6) and `docs/decisions.md`.

If a claim cannot be cited, either go and measure it or cut it. **When the
build cannot answer a question yet, say that instead of imagining an answer.**
"There is nothing here for the rules lawyer to push against yet, and here is
the first thing there should be" is a real finding.

## The archetypes

Ten, with the first five getting full treatment and the rest a shorter one:

1. The casual player — "just tell me a story", low friction, no rules
2. The deeply immersive roleplayer — loves the small details, the voice of
   an NPC, a callback to something from forty turns ago
3. The rules lawyer / min-maxer — wants the optimal play, reads every roll,
   tries to talk the GM into a verdict the dice did not give
4. The god-mode cheater — wants power, fast, free and fun; tries to edit
   the notes, retry until it goes their way, or argue the GM round
5. The adventure author — builds with the Game Designer, imports a
   rulebook PDF, expects the GM to run what they wrote
6. The tabletop veteran — knows Mythic, Ironsworn, PbtA and Blades, and
   will notice when a move or an oracle is wrong
7. The group host — couch co-op or an online room; wants everyone to get
   the spotlight and nobody to see the GM's secrets
8. The cost-watcher — brought their own key and watches what every turn
   costs
9. The accessibility-needs player — TTS, STT, font and reading settings
10. The long-campaign player — still playing on turn 500

Add one the system under test would attract; drop one it could not possibly
reach. For this app the eleventh worth reaching for is **the player who
wants the GM to remember** — who expects the innkeeper they saved to recall
it, a clue from session two to matter in session nine, and a dead NPC to stay
dead. If a system under test cannot answer that player, that is usually the
most valuable page in the report.

But cover a genuine spread — five variations on "someone who likes
tabletop" is one archetype wearing five hats, and it will produce one
finding wearing five hats.

## The closing section is the point

**End with cross-cutting patterns.** The findings that hit several archetypes
from different directions are the highest-leverage ones, and they only become
visible once several archetypes are on the page together — no single
archetype's complaint reveals them.

The reference example, from the author's earlier simulation, Acts of Gods: a
pass found that an entire wealth system, built across ten steps, was
invisible in play. That did not come from any one archetype. It came from
noticing that nine of the ten were, in effect, being asked what they thought
of an economy they could not see. The same shape exists here: a system the
engine runs and the player never sees (a director move, a reflection, a
Front's clock) is worth asking that question about.

## Output

Write it to `docs/playtesting/`. Two files, both halves of the loop:

- **`docs/playtesting/player_archetypes.md`** — the report itself.
- **`docs/status/next_projects.md`** — what a response to one turned into.
  Findings become scoped, branch-sized work, not a list of vibes. Record
  explicitly when an ask **reverses** a decision already written down
  elsewhere (`docs/decisions.md` first), and name which document that
  reversal invalidates.

## Two failure modes

**Do not tune to the findings.** A report that says the GM under-produces
memorable NPCs is a finding about the system, not an instruction to move a
coefficient or add a line to the prompt until the number matches. The
honest response is usually a change to what the engine gives the model, not
a louder instruction to the model.

**A pass asked to find gaps will find them.** That is what it was asked to do.
Before anything gets built from the result, triage it against *does this
affect correctness or a stated requirement*. Implementing every finding is
over-engineering wearing thoroughness as a coat.
