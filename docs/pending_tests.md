# Pending tests

Checks a session could not perform itself, written as checks a person
performs, with the expected result and — where predictable — what the
failure looks like. Newest at the top, one dated heading per session.

**This file is for work that was impossible, never for work that was merely
extra effort.** A session on the author's machine that can run a check runs
it. A session that confirms an entry deletes it; entries only leave this
file by being tested, not by ageing out. See `CLAUDE.md` → "What a cloud
session cannot do".

## 2026-10-25 — Judge layer J1: rung 1 and the re-ask

All of this needs a live model and the author's go; the engine side is covered
by `tests/judges.rung1.test.ts` and `tests/generation.reask.test.ts`.

- **Fantastic Realms fight, with a real GM.** Start Wolfwillow Crossing, get
  into a fight, strike a foe. Expected: the GM's `feat_roll` carries `target`
  (the foe's name) and the foe's Hearts meter drops by the damage on the same
  turn. Failure looks like a `feat_roll` with no `target` (no contract applies,
  nothing is checked) or, in Debug Logs, "Rung 1 hit (event_contract) - re-asking
  the GM once" on most hits, meaning the GM is not recording damage unprompted.
- **After such a re-ask.** The turn's prose is the GM's first draft, with the
  damage recorded; the Hearts meter lost the right number. Failure looks like the
  story reading "Recorded." (the acknowledgement kept instead of the draft).
- **A campaign with a line.** Add a line with a keyword (`campaign` tool, safety
  lines) and steer a scene toward it. Expected: the keyword never reaches the
  screen, or Debug Logs show the re-ask and the GM's rewritten passage. Failure
  looks like a passage that keeps the word, or a GM that answers "same text".
- **The pacing note is saved.** After a turn that trips a pacing counter, save
  and reload the story: the last GM part still carries the note (Copy GM
  context on the next turn shows it). The page copies `pacingNote` in three
  `onComplete` handlers, which no headless test reaches.
- **Pacing note.** In a couch or party game with two players, leave one unnamed
  for four turns. Expected: the next turn's GM prompt (Copy GM context) carries a
  "has not been addressed by name" line under the story-progress check-in.

## 2026-10-25 — Engine-review fixes on the campaign slice

- **Play one turn on a Gemini model (Google AI Studio key) in a story that has a
  campaign record** (add a clock with the `campaign` tool first, or open a
  story with timers). Expected: the turn succeeds and the GM can call
  `campaign` (a `data` argument arrives as a JSON string and is parsed).
  Failure looks like a 400 from Google, "properties should be non-empty",
  naming the `campaign` tool's `data` parameter.

## 2026-10-25 — Campaign format, slice C1 (decisions 222–225, 230–232, 241)

Engine only; no screen shows it yet (the Lore panel is slice 6). All of it is
unit-tested; none of it has met a real model (the author's key):

- **Open a story that has a countdown timer** (a saved one, or make one with
  `manage_timer create`). Expected: Debug Logs show "Migrated countdown timers
  to campaign clocks" on load only for a story that already had timers; the
  next turn's live block shows a "CAMPAIGN" brief listing the timer as a clock
  (`name 2/6 [manual]`) and no "ACTIVE TIMERS" section. A story with no timers
  shows neither.
- **Play a turn with a model on a story that has a record** (ask the GM to
  `campaign add` a style, a front and a clock with `triggers: ["scene"]`).
  Expected: the GM's `campaign` calls succeed, or are refused with a line that
  names the repair ("faction needs `goal`"), and a later `increment_scene`
  produces a "[Clock … → …]" line in the tool result. Failure looks like the GM
  never calling `campaign` (its schema is bare on purpose: it learns a shape
  from `read` on an empty part), or a clock that does not move on a scene.

## 2026-10-25 — Fantastic Realms (decisions 201–219)

Seen in the browser preview: the Library lists the system, its two packs and
*Wolfwillow Crossing*; a started story opens on the welcome; the Meters panel
shows a hero's Hearts, Level, XP and feat chips with a burned feat struck
through (state written by hand). Never played against a model (the author's
key):

- **Play Wolfwillow Crossing to the first fight.** Pick a preset, Quick setup,
  approve the card. Expected: during setup the GM calls `manage_meter
  create_set "Fantastic Realms hero"` and `manage_feats add` four times for the
  hero (Debug Logs), the Notes page then shows the hero's meters and feats, the
  opening is the Lantern Eve arrival, and a roll is a `feat_roll` naming feats
  and a DC (never `formula_roll` or `action_roll`). Burn a feat: the chip
  strikes through and a later `feat_roll` naming it is refused. Beat a foe:
  `award_xp` credits every hero, and the same source a second time is refused.
  Failure looks like: the GM rolling with `formula_roll`, or "Unknown tool"
  errors (then the story did not resolve to the system: check
  `systemState.systemId` in the Story Editor).

## 2026-10-25 — Judges on, turns held (decisions 220–221, 237, 240)

Built and unit-tested (the held turn's callbacks, the phases, the rewrite
released once, the Stop); not played on the APK or against a real model:

- **A turn appears only after it is checked.** On the Android app, play a
  turn with the default Observer settings. Expected: the work line reads
  "Writing…" (or "Thinking…" while a thought streams), then "Checking the
  turn…", and the turn's text appears all at once; nothing streams in word by
  word and read-aloud starts only when it appears. Failure looks like: prose
  streaming in before "Checking the turn…", or text that changes after it was
  shown.
- **A long turn comes back shortened.** Set Response Length to short and play
  until a turn runs well over the ceiling. Expected: "Revising…" shows, the
  shortened text appears, the turn's actions offer "Undo revision", and Undo
  puts the long first draft back. Failure looks like: the long text shown
  first, or no Undo revision.
- **Flag-only judges still stream.** In Settings, set every judge to Flag.
  Expected: the next turn streams live as before, with no "Checking the turn…".
- **The agency judge rewrites (decision 237).** Play a turn where your line
  is short ("I nod.") against a GM that tends to speak for you. Expected: every
  turn with a line shows "Checking the turn…" for about a second; a turn that
  decides what your character says or feels is revised before you see it, with
  "Undo revision". Failure looks like: such a turn appearing at once with only
  a flag toast.
- **A pause shows the scene first (decision 240).** Play until the GM writes a
  few paragraphs and then asks a question, a roll or the dice tray. Expected:
  the paragraphs are on screen, checked, before the question appears; the text
  after your answer appears together once checked. Failure looks like: the
  question over an empty turn, or the first paragraphs changing after you
  answered. Also try it as an online guest: the host's question should not show
  the previous turn's text as "being written".
- **A pause rewrite with Claude (decision 240, engine-review fixes).** With a
  Claude model as the GM at a thinking effort, play until the GM asks a
  question after a stretch of prose that a judge rewrites (agency is the easy
  one). Answer. Expected: the turn continues with no 400 from OpenRouter about
  thinking blocks, the second round's request (Debug Logs) shows the rewritten
  prose beside the tool call, and the next turn's GM does not repeat the first
  draft's habit. Failure looks like: a 400 naming `thinking` or `signature`
  after the answer.
- **A failed suggestions call keeps the turn.** With Suggested Choices on, turn
  the network off just as the turn's text is about to appear (or use a model
  that rejects the choices call). Expected: the narration still appears, with
  no suggestions and a Debug Logs line "Choices generation failed".

## 2026-10-25 — Starters welcome you in (decisions 197–200)

Seen in the browser preview (the welcome first, the opening not shown); not
played to start_game against a real model:

- **Play Grave Watcher to the start.** Play → a Watcher → Quick setup → answer
  → approve the setup card. Expected: the GM's first story turn gives a short
  briefing (Hollins Ferry, the Watch, Tower Nine), then plays Founders' Day
  morning in town (pancakes, Walt, June with the keys, Cora and the pie table)
  and ends on a choice; no green light before dusk. Failure looks like: the GM
  opens on the tower or the green light, or never mentions the pancake
  breakfast (then the opening did not reach it: the Debug Logs' start_game
  result should end with "The adventure's author wrote the opening scene").

## 2026-10-25 — Session zero hands back; the output-cap retry (decisions 195–196)

Covered by the suite against scripted rounds; not played against a real model
(that spends the author's key):

- **A quick Blood & Bone setup on the APK or desktop, defaults untouched**
  (Response Length 8,000, Advanced on Claude Sonnet 5.5). Pick Quick setup,
  answer the setting/tone/kind question. Expected: the same turn goes on to
  write the sheet, or ends on a line such as "Next up: your character sheet.
  Anything you want me to know before I write it? Or just say go on." - never
  "(Let's finish setting up first: …)". If the Debug Logs show "GM stage round
  N finish diagnostic" with `truncatedAtCap: true`, the next line should be
  "GM stage round cut off at the output cap with nothing usable - asking again
  at a higher cap", and the following round's `maxTokensCap` should be 16,000.
  Failure looks like: two `truncatedAtCap: true` rounds in a row both at
  8,000, or the hand-back line on every setup turn with the sheet never
  written (then the cap is not the cause: send the Debug Logs). **The
  unverified premise:** Claude is sent only `reasoning.effort`, and if
  OpenRouter turns `xhigh` into a fixed share of `max_tokens`, doubling the cap
  doubles the thinking too, and the retry round is cut off again (a second
  `truncatedAtCap: true` at 16,000). Then the fix is a lower setup effort or a
  larger Response Length, not this retry.

## 2026-10-24 — Feedback in the app (decisions 190–194)

Run locally against `wrangler dev` with a local D1, from the web preview and a
debug desktop build (`docs/devlog/2026-10-24-feedback.md`). Owed, because
they need the author's Cloudflare account or a phone:

- **Deploy it.** Follow `sync-worker/README.md` → Feedback: `wrangler d1
  create`, paste the id into `wrangler.toml`, apply the migration with
  `--remote`, `wrangler secret put FEEDBACK_ADMIN_TOKEN`, deploy. Expected:
  `curl -X POST <worker>/feedback` with a valid body answers `{"ok":true,
  "ref":…}`, and `<worker>/feedback/admin` with the token lists it. If the
  deploy refuses the `[[ratelimits]]` block, the account's wrangler is older
  than 4.36.
- **The burst limit.** Send six submissions from one machine within a minute.
  The sixth should answer 429 `rate_limited`, and the form should say "That's
  a lot of feedback at once". Locally the limiter is only simulated.
- **Retention.** A day after deploying, the Worker's Cron Events should show
  the 03:00 UTC run, with no errors.
- **The repository variable.** Create `NEXT_PUBLIC_SYNC_API_URL` (Settings →
  Secrets and variables → Actions → Variables) before the next
  `build-apps.yml` run, or the native builds ship with no feedback entries.
- **Android.** In an APK built with `NEXT_PUBLIC_SYNC_API_URL` set, send from
  a starter's Feedback button. Expected: a reference shown, and the row on
  the admin page with platform `android`. A failure would read "Couldn't
  reach the feedback server" (the patched native fetch) or "The server didn't
  accept that" (a body the Worker refused).
- **iOS.** The same, with platform `ios`; there is no Mac here.

## 2026-10-24 — The judge layer: flag only (decisions 187–189)

Built and covered by the suite against scripted providers and pure functions;
never seen on a screen or against a real model (the build session had neither
the app nor a key, and a played turn spends the author's):

- **One desktop turn of each starter, defaults untouched.** Delete the stored
  `observerCheckSettings` first (or let the one-time reset do it: Debug Logs
  should show "Observer settings reset to the flag-only defaults" once), then
  play a turn of each starter (the Grave Watcher among them, Claude Haiku as
  GM). Expected: **no rewrite ever appears** - the text you read does not change
  after it streams, there is no "Narration revised" toast, no "Undo revision"
  label, and no "GM response was reset" toast. In the Debug Logs the only
  Observer call is the `outcome_narration_mismatch judge`, and only on a turn
  with a roll (`action_roll`, `progress_roll`, a challenge result or a
  `calculate` comparison). Failure looks like: a "player_agency judge" or
  "response_length judge" call, or a "Narration rewrite" call, in the cost
  breakdown.
- **A reversed roll shows the outcome flag.** In a Blood & Bone story, get an
  `action_roll` that comes back a miss and make the narration describe a clean
  success (for instance by typing "I vault the wall" after a miss, or by
  editing the next prompt). Expected: the turn gets a "GM response flagged"
  toast naming the miss, `observerFlags` on the turn in the context viewer, and
  a "Observer: turn flagged (background, non-blocking)" Debug Logs line - and the
  prose is untouched. A weak hit narrated with a cost must NOT be flagged.
- **A hidden note read shows "(hidden note)".** Make the GM `read_notes` a note
  whose visibility is hidden (or whose type is secret), then open the turn's
  folded work line and expand the read_notes pill. Expected: the note's title and
  "(hidden note)", not its text. The Debug Logs and the context viewer still
  show the full text. Check an ordinary note in the same call still shows its
  text.
- **Settings.** Settings -> Architecture -> Observer Checks: each check reads
  Off / Flag (and "Rewrite automatically" on the three prose checks), the cost
  line counts the calls ("up to 1 extra AI call per turn" by default), "Reset
  all to defaults" is hidden on a pristine config, and switching Player Agency
  to Rewrite automatically shows the warning line and a cost line that adds a
  rewrite call.
- **Opt in, once, to the old behaviour.** Switch Response Length to Rewrite
  automatically and send a deliberately long turn. Expected: the composer stays
  locked until the judge has decided (no second action can be sent while it
  does), read-aloud starts only after the final text, and a rewrite - if the
  judge keeps the flag - shows "Narration revised" and an "Undo revision" on
  that exact turn (tap the turn, even after a newer one exists). A rewrite
  that comes back as a refusal or cut off leaves the original text and
  attaches the flag; it never rolls the turn back or re-rolls the dice.
- **Stop during a judge.** With a judge on, press Stop while "Thinking" shows
  after the prose has streamed. Expected: the turn is cancelled (the usual
  Stop revert), no later rewrite or reroll lands, and the cost panel shows the
  cancelled call as "cost unknown".
## 2026-10-24 — The 1-hour cache and streamed usage (decision 186)

Needs a real model (an OpenRouter key; a few cents):

- **The 1-hour cache is accepted.** Play two turns with a Claude model through
  OpenRouter, more than five minutes apart. Expected: the second turn's "AI
  generation (stream) complete" line in the Debug Logs shows a large
  `cachedTokens` (most of the ~60k prefix) and a small `cacheWriteTokens`.
  Failure looks like: `cachedTokens` 0 after the pause (OpenRouter dropped the
  TTL), or a warning "OpenRouter rejected the 1-hour cache TTL" (it refused
  it; the turn still went through on the 5-minute cache).
- **Streamed turns report usage.** Any streamed turn's "AI generation (stream)
  complete" line shows non-zero `promptTokens`, and the turn cost panel a
  cost. Failure looks like: `promptTokens: 0` as in the 2026-10-24 logs.

## 2026-10-24 — System turn-end checks / the dawn check (decisions 183–184)

Built and covered by the suite against a scripted provider; never run against
a real model (a played turn spends the author's key):

- **Replay the playtest line on the desktop app**, in a Blood & Bone story
  (the Grave Watcher starter, Claude Haiku as GM): send "at dawn I climb down
  and go to bed. Next morning, I go find Cora". Expected: after the morning
  prose the GM calls `end_session` and runs the Reckoning in the same turn
  (a "Turn-end check night-ended" line in the Debug Logs, then the
  `end_session` result with its reminder, the Reckoning's `formula_roll`, the
  Beast adjustment), and the turn ends on the corrected morning. Failure
  looks like: the Debug Logs line is there but the GM answers with prose
  only (it declined; check whether the message wording is clear enough), or
  no line at all (the story did not resolve as Blood & Bone, or `end_session`
  is not on the tool list).
- **A decline on a false alarm.** Send "we need to be back before dawn".
  Expected: no reminder at all. Then "I wait here; the sky is still dark and
  dawn is hours away": at most one reminder, and the GM carries on without
  `end_session`.
- **Google as the GM** (a Google key, a Gemini model in the Default slot): the
  reminder round may answer with prose alone. Expected: it does, where every
  other Google round is forced to call a tool.

## 2026-10-24 — Rebrand to Endless Adventure (decisions 181–182)

Checked on the desktop build: the window title and the page titles read
Endless Adventure, the installers are named "Endless Adventure_0.1.0_x64…",
and a profile from before the rename still shows its stories. Needs a device:

- **Windows upgrade over the old install.** Run the new setup.exe on a PC that
  has "Your Story" installed. Expected: it replaces the old install (the app
  identifier is unchanged) and the stories are there. Failure looks like: two
  entries in Apps & features, "Your Story" and "Endless Adventure", side by
  side (the installer's folder and name come from the product name), with the
  stories in both because the data folder follows the identifier.
- **Android update.** Install the new APK over the old one. Expected: an
  update, not a second app; the launcher label reads Endless Adventure; the
  stories are there.
- **iOS.** The home-screen name reads Endless Adventure (no Mac here).

## 2026-10-24 — Playtest fixes (decision 178)

Needs a real model (the desktop app, the subscription or a key):

- **Taint on a miss near the green light.** In Grave Watcher, go down to the
  light and fail a roll. Expected: manage_meter adjust Taint +1, whatever the
  miss table gives. Failure looks like: "no Taint trigger here".
- **A strong hit shows.** Talk an NPC round with a strong Compel. Expected: the
  prose shows them agreeing. Failure looks like: the GM records it (attitude,
  plan) and the story never says it.
- **A matched miss.** Expected: the miss table rolled twice, or one result at
  double severity, as the MATCH line now says.
- **Known open, not fixed by wording:** crossing dawn ("next morning") still
  skips end_session and the Reckoning on Haiku (devlog
  2026-10-24-playtest). Needs an engine reminder.

## 2026-10-24 — Blood & Bone campaign starters (E5, decisions 163–173)

Checked in the browser preview: both starters are on the Library home; Play
shows the roster (eight Watchers) and the family (five relatives); a picked
Watcher's sheet becomes the story's character sheet; the story is saved with
its setting, its own meter (Unrest at 1, Vacancy at 3), its NPCs (25, 16)
and no Europe by Night note, and a reload adds none. Needs a real model:

- **Grave Watcher's first session.** Play, pick Dee Harjo, Quick setup.
  Expected: session zero writes a Campaign Plan from "Grave Watcher — The
  season", creates Dee's Taint meter with `manage_meter create` (0-6), and
  after the setup card the first scene is the radio and the green light, then
  a day in Hollins Ferry: the Lamplight, Marisol, regulars by name. Failure
  looks like: the GM creating the "Blood & Bone character" set and talking
  about Exposure, Heat or the Masquerade (it missed the Running-it reread), or
  a scene with no town in it at all (the slice-of-life tone did not land).
- **The town tables.** In town, ask "who's at the diner?". Expected: the GM
  rolls "Who's at the Lamplight" (formula_roll 1d20) or "People you might
  meet" (1d100) and the Names table, instead of inventing.
- **Solo fills the team.** Expected: the GM puts the unpicked Watchers on the
  radio by tower and call sign.
- **The Last Resort's first week.** Play, pick Dara Alder. Expected: Mr.
  Pell at the desk, the will, the basement warning; Vacancy (not Heat) moves
  with refunds and bookings; the tone is funny with real danger.

## 2026-10-24 — Blood & Bone new Kinds and Powers (E4, decisions 160–161)

Needs a real model:

- **A new Kind in session zero.** Start a Blood & Bone story, step by step,
  and ask to play a Rusalka. Expected: the Kind question offers all eleven
  Kinds; the GM reads `B&B — Rusalka` and `B&B — Creation prompts: Rusalka`,
  asks where her water is, and offers the Drowner and the Willing Tide. Failure
  looks like: the GM saying the Kind does not exist (a story made before E4
  holds the old creation note listing seven Kinds; the Kind notes still arrive
  on load).
- **A Power's first ability used in play.** With a Vampire who has Blood
  Scent, ask the GM to track someone by blood. Expected: the GM applies the
  ability's add (+1 or +2 by the ability) to the roll. Failure looks like: the
  GM treating the Power as permission only, with no add.

## 2026-10-24 — Blood & Bone character options (E3)

Needs a real model:

- **A third Archetype in session zero.** Start a Blood & Bone story, step by
  step, and pick a Vampire. Expected: the archetype question offers three
  options, the Courtier among them, with what each does in play, and the GM
  read `B&B — Vampire: The Courtier` to describe it. Failure looks like: only
  the two Archetypes from the Kind note (the GM did not open the new note;
  a story made before E3 holds the old creation note, which says two).
- **A new asset bought with XP.** In play, spend 2 XP on a Path from
  `B&B — More Paths`. Expected: the GM reads that note and writes the first
  ability onto the sheet.

## 2026-10-24 — Europe by Night, deeper (E2)

Checked in the browser preview: a *Hollow Hour* story from 2026-10-23 gains
the three continent notes (and E1's twelve tables) on opening, and no new city.
Needs a real model:

- **The GM uses a city.** In a story set in London, travel ("I take the night
  train to Edinburgh"). Expected: the GM reads *Europe by Night — Edinburgh*
  if the story holds it, or the overview's "where to read more" list tells it
  the city lives in the library (it is not pushed); it then plays the
  Closemen or Tollhouse Court rather than inventing a faction.

## 2026-10-24 — Blood & Bone tables, E1 (decisions 150–159)

Run on the desktop app with the author's go (Claude Haiku subscription,
high, as Default; Sonnet as Advanced): the starter carries London and the
overview only; the compact list reaches the GM; after the "roll it rather
than inventing" line was added, the GM read The night, Places, People and
Rumours unprompted, rolled d66 as `["1d6","1d6"]` and read 2+2 as 22 and
1+4 as 14 correctly, and rolled 1d100 for a name (75, Piet Mulder) and used
it word for word. Still open:

- **Old stories keep their oracles.** In a story made before E1, the three
  old oracles still read `Roll 1d10:` (held notes are never updated,
  decision 156), and its core does not carry the new "roll the table" line;
  the TABLES heading in the live block does. Expected: such a story still
  uses the new tables when asked for a stranger. Failure looks like: the GM
  calls `generate_name` instead, as it did before the heading line.
- **Faithful to the roll.** Once the GM rolled 15 on Weather and light and
  narrated entries 1 and 14 instead. Watch whether the GM uses the entry the
  die lands on; if it keeps drifting, the TABLES line should say so.
- **Not this PR, seen while testing:** a line of the GM's own planning
  showed in the prose twice ("Before the answer comes, I need to know what
  it costs you."; "Let the street show you what it is tonight."), from an
  earlier round's text in a multi-round turn. And the folded work line shows
  `= **75**` with its markdown asterisks.

## 2026-10-24 — session zero detail (decision 148)

Built from [`session-zero-detail-design.md`](session-zero-detail-design.md).
Every check below needs a real GM turn with a real key, on the Android APK
(party mode's phone check on the desktop app), so each waits for the author's go. The suite and `tsc` cover the step lists, the
recording rules, the card's refusal, the auto-start flag, the latest-round text
and the phone redaction. They do not cover whether a real model tags its
questions, writes a good intro, or what the modal looks like with the keyboard
open.

- **Full Blood & Bone setup, step by step (APK).** New story from *The Hollow
  Hour*, tap **Step by step**, one solo player. *Expected:* each creation step
  is asked in turn, one question per step for the character (Kind, Archetype,
  stats, Vow, connections, burden, Power, Path, gear), then name and look,
  history and drives; each question opens with a sentence or two and its options
  say what they do in play. The strip reads **Setup 0/15** and counts up to
  **Setup 15/15**. Before the last step is covered, **Start the story** cannot
  be reached: the card does not open, and the GM says which step it still needs.
  *Failure looks like:* a step skipped, two character steps in one question, a
  question with no intro or with bare option labels, the strip showing a total
  other than 15, the card opening early, or the GM narrating before the card.
- **Start the story starts the game (APK).** From the card of the run above,
  press **Start the story**. *Expected:* the card closes, and in the same turn
  the GM writes the campaign briefing, then the opening scene, ending on a clear
  first choice. No "Let's go" is needed. *Failure looks like:* the line "(Let's
  finish setting up first: next is starting the game.)", a turn that waits for
  the player to type, or a second card.
- **No old text re-shown during setup (APK).** During the run above, read each
  turn's text. *Expected:* each turn shows only the question for the next step;
  the first step's question ("what kind of creature…") does not come back after
  later steps. *Failure looks like:* an earlier step's line appearing again at
  the end of a turn, or an empty turn that stops setup.
- **Quick setup asks setting and tone once (APK).** New story, tap **Quick
  setup**, answer two to four questions. *Expected:* setting and tone are asked
  (possibly in one question, with tone as multi-select), neither is asked a
  second time, and the GM then proposes. The strip shows the old four items, not
  "Setup n/total". *Failure looks like:* setting or tone asked again after it was
  answered, a "Setup n/total" item in quick mode, or the GM still asking after
  about six questions.
- **Closing the card, then silence (APK).** Open the card and dismiss it with
  the X. Then, if the GM says nothing more, the turn ends on the line
  "(What would you like to change?)". *Expected:* that line, and the card does
  not open again by itself. *Failure looks like:* the card reopening on its own,
  or the line "(Let's finish setting up first: …)" instead.
- **Long intro with the keyboard open (APK).** In a full-mode setup, get a
  question whose intro is several sentences, then tap a text box to type a
  custom answer so the Android keyboard opens. *Expected:* the intro, the
  options, the custom box and the Send and Done buttons can all be reached by
  scrolling inside the modal, and none is hidden behind the keyboard.
  *Failure looks like:* a button that cannot be scrolled to or tapped, or the
  modal running off the top of the screen.
- **Party phone shows the intro (party mode, desktop table and phone).** Open a
  table with two players, go to a step-by-step setup and wait for a question
  addressed to a phone. *Expected:* the phone shows the question's intro above
  its options. *Failure looks like:* the options with no intro line, or the
  phone showing the table's secrets (any setup note's text it should not have).
- **A starter with a pre-made character (APK).** Pick a starter that has a
  pre-made character, choose **Step by step**. *Expected:* the GM asks only the
  world steps (setting, tone, campaign) and the strip reads **Setup 0/3**, with
  no Kind, Archetype or name questions for the pre-made character. *Failure
  looks like:* the character steps asked again, or a total other than 3.

## 2026-10-23 — Session zero (claude/session-zero, decision 147)

Built from [`session-zero-plan.md`](session-zero-plan.md). Every check below
needs a real GM turn, so each one spends the author's key and waits for the
author's go. The suite, `tsc` and the engine unit tests cover the state, the
tools, the gate's counting and the buffering. They do not cover what a real
model does with the prompt, or what the screen shows. The style buttons and the
checklist strip were seen in the preview (see the devlog); the setup card and
the multi-select modal were not seen on screen, because they need a GM turn.

- **Quick setup on Blood & Bone, default ladder (desktop app).** Start a new
  story from *The Hollow Hour* or from a freeform story with the Blood & Bone
  rules. Tap **Quick setup**, answer two to four questions (include one
  multi-select question and tick two options), and let the GM propose.
  *Expected:* the GM asks by tapping choices, not by prose; the checklist ticks
  Concept, then Character (a sheet appears), then Campaign (a plan appears); a
  setup card opens showing the sheet and the plan; **Start the story** closes it
  and the GM writes a short briefing, then the opening scene ending on a clear
  first choice. *Failure looks like:* story narration before the card; the line
  "(Let's finish setting up first: next is …)" in the timeline (the gate ran
  out, so a step was not finished); the card reopening after Start; the Debug
  Logs showing a `read_notes` of the creation rules on every turn (the block
  should carry them).
- **Step by step on Blood & Bone, default ladder (desktop app).** As above with
  **Step by step**. *Expected:* one question per creation step (Kind, Archetype,
  stats, powers, connections, background), the creation rules visible in the AI
  Context's live block and not read again each turn, then the same card and the
  same briefing. *Failure looks like:* several steps in one question, a step
  skipped, or the creation rules read again on every turn.
- **The same two runs on the Android APK**, from the `build-apps.yml` build.
  *Expected:* the same flow and the same card, on the phone's own screen. *Failure
  looks like:* the card missing, the style buttons not responding, or a
  rejected round's text showing before the card.
- **Change something on the card.** Tap **Change something…**, type "make her
  older", press Send. *Expected:* the GM edits the sheet, the card opens again
  with the new text, and Start on that card starts the story. *Failure looks
  like:* the card showing the old text; or `start_game` refusing after Start with
  "the sheet or the plan changed after the player's OK" (the second card did not
  bind the new text).
- **Stop while the card is open.** Press Stop. *Expected:* the card closes, the
  turn stops, the sheet and the plan are as they were before the turn, and the
  story has not started. **Dismiss** (the X, or tapping outside) instead: the GM
  asks in chat what to change, and nothing is written or started. *Failure
  looks like:* a sheet or plan appearing after Stop, the story starting, or the
  card coming back by itself.
- **A Claude model as the GM.** Set the Default slot to a Claude model through
  OpenRouter (no forced tool choice; the message does the forcing) and run quick
  setup. *Expected:* setup still ends with the card before any story text.
  *Failure looks like:* prose before the card. An engine line is a weaker
  failure, not a pass: note it and the model.
- **Couch with two players.** Two players, two sheets. *Expected:* the checklist
  ticks Character only once both sheets exist, and **Start** cannot be reached
  with one. The refusal names the missing player. *Failure looks like:* Character
  ticked after one sheet, or the card opening with only one.
- **Online, host and a guest.** The host runs quick setup, a guest joins.
  *Expected:* the guest sees no card and no style buttons (the strip reads "The
  host is choosing how to set up."), and gets each setup turn's text once, when
  the turn ends. *Failure looks like:* the guest sees the card, sees prose from a
  turn the engine rejected, or gets buttons that do nothing.
- **Not yet seen on screen:** the setup card (`SetupConfirmModal`) and the
  multi-select question modal. Both open only during a GM turn, so the first
  real session above is their first look. Check the card on Ink and on Paper
  White, and the checkboxes with a long option label.

## 2026-10-23 — Downloads on the phone, and the AI Context height (claude/ai-context-phone)

- **AI Context -> the download (JSON) and TXT buttons, on the Android APK.**
  Expected: the file is saved straight into `Downloads/Your Story/` (open the
  Files app, Downloads) with a "Saved to Downloads/Your Story/context-gm-....json"
  message, and no share sheet opens. Pressing it twice gives two files, not an
  overwrite. On Android 7-9 a one-time storage permission prompt appears first;
  denying it shows an error message. Failure looks like the share sheet (an
  old build), an error toast, or a "Could not save the AI context" line in the
  Debug Logs. On iOS the share sheet is kept (no Downloads folder there).
- **The same for Debug Logs -> Export, the Story menu -> Export, and the
  Library's folder and notes exports.** Each saves to `Downloads/Your Story/`
  and shows "Saved to ...". The web and desktop apps behave as before.
- **AI Context and Debug Logs fill the screen on the phone.** The panel
  reaches the bottom with only a small gap, scrolls inside itself, and its
  up/down buttons work; rotating the phone refits it. Failure looks like an
  empty band below the panel (the old fixed height), or the whole page
  scrolling.
- **Desktop app: Export still saves a file** (the anchor path is unchanged
  there).

## 2026-10-23 — Whole-app themes

Built from [`whole-app-themes-plan.md`](whole-app-themes-plan.md) on
`claude/whole-app-themes` (decisions 137–141). The suite and `tsc` cover the
token arithmetic, the bootstrap script and the colour ratchet. The screenshots
were taken in the browser preview, not in the native apps, and a real phone
was not available. These checks cover what the shells and devices do. Pick
the theme in Settings → Display unless a check says otherwise.

- **Paper White on the desktop app.** Build the branch with `tauri build`,
  launch the app, and pick Paper White. *Expected:* the page, its scrollbars
  and its form controls are light (a select's dropdown, a number field's
  spinner), and the story and the Library read as they do in the preview. The
  Windows title bar is drawn by the OS and is not expected to change; write
  down what it shows. *Failure looks like:* a dark native scrollbar or select
  popup on the light page, or a dark strip where the page should be.
- **Paper White on the Android app.** Install the APK from `build-apps.yml`,
  pick Paper White, and go to Home and back. *Expected:* the status bar at
  the top is light, matching the page (the `theme-color` meta follows the
  theme). The native scrollbars on the Library and the Notes list follow the
  theme. *Failure looks like:* a dark status bar over a light page, or a dark
  scrollbar. The status bar is the one thing here that depends on the
  WebView honouring `theme-color`; if it does not, record it and say so.
- **No dark flash on launch.** Pick Paper White, close the app fully, then
  start it again (on Android, with the network throttled to slow 3G if you
  can). *Expected:* the first frame is the Paper White page; nothing dark
  shows before it. *Failure looks like:* a dark frame, or the Ink page for a
  moment before the light one, on the desktop app or the APK.
- **iOS overlay scrollbars.** No iOS build was made for this branch (no Mac
  here; `build-apps.yml` is a manual release build). When one exists, pick Paper White
  and then Ink on a long Notes list and a long story, and scroll. *Expected:*
  the overlay scrollbar shows while scrolling and is visible on both pages.
  *Failure looks like:* the overlay bar is invisible on one theme, or the
  same colour as the page.
- **The party phone's theme picker, on a real phone over the LAN.** Open the
  table's QR link on a phone on the same Wi-Fi. Join, then open the "Theme"
  disclosure at the foot of the page, and pick Paper White. *Expected:* the
  phone page turns light at once. Reload the page: it is still Paper White.
  The table's screen is unchanged, and so is any other phone. Repeat with
  Sepia on a second phone. *Failure looks like:* the page reverting to Ink
  after a reload (the phone's storage is not kept, as in a private tab, so the
  choice lasts one visit), the table's theme changing too, or the picker
  missing from the join form, the lobby or the seat view.
- **A sync from another device re-applies the theme without a reload.** On
  device A, pick Paper White. On device B, which is signed in to sync and has
  Ink, open Settings → Sync and run a sync (or let it run on its own). Leave
  the Library or a story open on B while it runs. *Expected:* B's colours
  change to Paper White once the sync completes, with no reload. *Failure
  looks like:* B stays on Ink until it is reloaded, or the screen is half
  converted (the page background changes but the cards do not).

## 2026-10-23 — Android: background turns and back (`claude/android-background`, decisions 132–136)

Built from [`android-background-plan.md`](android-background-plan.md). Nothing
here ran on a phone: this machine has no Android SDK, and the APK is built by
`build-apps.yml`. The suite and `tsc` cover the JS side and the shapes; these
checks cover what the phone does. Use a story with an OpenRouter key, on a
real turn, and leave the app on Home unless a check says otherwise.

- **Send, leave, come back when done.** Send a turn, press Home at once, and
  wait until the turn would have finished. *Expected:* a "Your Story is writing
  your turn…" notification shows while it runs, and the turn finishes in the
  background. If you are still away when it ends, the notification becomes
  "Your turn is ready" with the story's name. Tapping it opens the app, with
  the reply in the feed. If you come back first, there is no "ready" ping, and
  the "writing" notification is gone. *Failure looks like:* no notification at
  all, the reply missing when you return (the turn died with the app in the
  background), "writing" still showing after the reply has landed, or a
  "ready" ping with no reply in the feed.
- **Screen off for 3 minutes, then 10 minutes.** Send a turn, lock the phone,
  and wait 3 minutes; repeat with 10 minutes on a second turn (a long
  reply helps). *Expected:* the reply is in the feed on unlock, and "ready"
  shows if the phone was locked when it finished. *Failure looks like:* the
  reply missing or cut short after the wait, or the turn stuck at "writing"
  with no reply and no banner after unlock.
- **A GM question while away.** Send an action that makes the GM ask a question
  (a question, or a roll the GM asks you for), then leave the app. *Expected:*
  a notification "The GM has a question for you" (for a roll, "The GM needs a
  roll from you"), with the question's text as the body. Tapping it opens the
  app, and the notification clears when the app comes back. *Failure looks like:* no notification while the turn sits waiting, or the
  question still showing in the notification after you return.
- **Swipe away mid-turn, then reopen.** Send a turn, open the recents list and
  swipe the app away before the reply arrives, then open the app again.
  *Expected:* the story opens with the last turn taken back to where it began
  (your line is gone as well, and any half reply), the banner "The last turn
  was interrupted." sits above the input, and Retry sends the line again and
  gets a reply. Dismiss removes the banner, and it stays gone
  after a restart. *Failure looks like:* half a reply or an empty bubble left in
  the feed, no banner, Retry doing nothing, or the banner coming back after
  Dismiss.
- **Streaming on the phone.** On OpenRouter, send a turn and watch the reply.
  *Expected:* words appear as they are generated, not all at once at the end.
  *Failure looks like:* the whole reply appearing in one go after a pause.
- **Stop mid-stream cancels.** Send a long turn on OpenRouter and tap Stop
  while words are still arriving. *Expected:* the reply stops at once, and the
  OpenRouter activity page shows the request as cut short, not completed.
  *Failure looks like:* the text keeps coming in the activity log, the request
  shows as complete, or the reply is stored as if it finished.
- **A bad key on a listed host shows its error.** Put a wrong key in
  OpenRouter, then in Mistral and in DeepSeek (one at a time), and send a turn
  with each. *Expected:* the provider's own error text appears (for example an
  "invalid key" or "unauthorized" message). This also checks that the CORS
  headers on error replies are there, which the preflight did not test.
  *Failure looks like:* "Failed to fetch" or "Load failed" instead of the
  provider's text. If that happens, the host's error replies lack CORS headers,
  and that host must be taken out of `CORS_HOSTS` in `app/misc/platformFetch.ts`
  (the app then uses the native path for it, which reads the error text).
- **Back from each surface.** With the story open, press the Android back
  gesture once for each row, and check the order. *Expected:* each back closes
  only the top thing: a confirm dialog, then the full-screen picture (open a
  portrait or a picture in the feed), the story menu sheet, the Story Editor
  inside it, a sub-page (Notes, NPCs, Goals, AI Context, Logs) back to the
  story, and the story back to the Library. From the Library, a sub-view
  (Stories, Adventures, Notes) goes back to the Library home, and the Library
  home backgrounds the app; reopening it shows the same screen as before.
  *Failure looks like:* the app closing on back, one back closing two surfaces,
  a surface that does not close on back at all, or the Library home sent to the
  start page instead of the background.
- **Back on the story during a live turn.** Send a turn and press back while it
  is still writing. *Expected:* the app goes to the background (as Home does),
  the turn carries on, and "ready" follows if you stay away. *Failure looks
  like:* the app going to the Library, or closing.
- **The permission prompt, on Android 13 and later.** On a fresh install, the
  first Send shows the notification permission prompt. Tap "Deny" and send
  another turn, then leave the app. *Expected:* the prompt appears once, in
  the middle of the first Send, and the turn still finishes after "Deny" (only
  the notifications are hidden). *Failure looks like:* the prompt on every
  turn, or a turn that never finishes after "Deny".
- **"Ready" only when away, on Android 14 and 15.** Send a turn and stay in the
  app until the reply lands. *Expected:* no "Your turn is ready" notification.
  Repeat with Home pressed before the reply. *Expected:* the ping appears
  once. *Failure looks like:* a ping while you are looking at the reply, or no
  ping when you were away.

## 2026-10-23 — Legacy removal (`claude/legacy-removal`, decisions 125–131)

Built from [`legacy-removal-plan.md`](legacy-removal-plan.md). Nothing here
was played and no model was called. The suite and `tsc` cover the engine and
the stored shapes; these checks cover the play.

- **Session zero on The Hollow Hour, a real model (the author's go: it spends
  on the key).** On the default ladder, with an OpenRouter key: Library →
  *The Hollow Hour* → Play → *Start Without Notes*. *Expected:* the story
  opens on the intro with no picker and no form. Before `start_game` the GM
  fills every field the Blood & Bone template lists, in conversation, and
  writes one `character_sheet` note (titled "Character: <name>" only when more
  than one person is playing). The AI Context's live message carries the
  CHARACTER SHEET TEMPLATE block until `start_game`, and not after it.
  *Failure looks like:* a sheet that keeps the template's `| default` example
  values, `start_game` called with no sheet note, the template block missing
  from the live message during session zero, or the GM asking for the plan
  before the sheet exists.
- **A starting choice with an authored opening, in session zero.** Make a
  Designer adventure with a starting choice that has an opening written for it
  (`intro_override`), start it, and pick that choice before `start_game`.
  *Expected:* the choice goes to the GM as the player's action, with the line
  "The adventure's opening for this choice, to narrate once setup is done"
  in the turn, the GM runs setup, and the authored opening is narrated after
  `start_game`. *Failure looks like:* the authored prose inserted at once
  with no GM turn (the old shortcut), the opening never narrated, or the
  choice's text arriving empty. The shortcut after `start_game` is not in this
  check: a starting choice is only on offer at the start.
- **Online play with an older guest.** Host on this build; join from a build
  from before 2026-10-23 (the last desktop build before this change). The guest
  opens the Story Editor. *Expected:* the editor opens and its sections render,
  and play carries on. *Failure looks like:* the guest's screen going blank or
  showing an error boundary when the Story Editor opens, with a message about
  `resources`, `relationships` or reading `map` or `spread` of undefined. The
  host's broadcast shim (`withLegacyGuestShim`, decision 126) is meant to
  prevent that.

## 2026-10-23 — The model picker, simplified (`claude/model-picker`)

Settings was walked through in the browser preview (the Models card, Mixed
after a simulated sync, a save keeping a newer build's entry, Advanced
settings, the Architecture tab, the Advanced tag). No model was called.

- **The first turn on the new ladder** (author's go: it spends on the key).
  On a fresh profile with an OpenRouter key, play two turns of any story, one
  ordinary and one in combat. Debug Logs → "Reasoning tier resolved" should
  show GLM 5.3 for both, effort `none` on the ordinary turn and `high` on the
  combat one; a long free-form action should log a "Tier classification" call
  on Claude Haiku 5.5. Failure looks like Haiku still on tier 0/1 (the old
  ladder) or the classifier on GLM.
- **A Mistral model in Default** (needs a Mistral key). Put Ministral 3 8B in
  Default and start a fight. The combat turn sends Mistral
  `reasoning_effort: "high"` (decision 123's floor); the GM round should
  succeed. If Mistral rejects the parameter on that model, every combat turn
  fails with a provider error (and there is no other model to step down to):
  then the floor must skip models that do not reason.
- **The Claude subscription on the desktop app.** Put a subscription model in
  Advanced, then join an online session: Settings and the in-game notice
  should name "Advanced" (not "Tier 3") as falling back, and the panel's
  instructions should point at Default/Advanced and AI → Advanced settings.

## 2026-10-23 — The story screen, simplified (`claude/story-screen`)

Everything that renders was walked through in the browser preview at 375 px
and 1280 px, in Ink and Paper White, on a hand-made save (no model calls); see
`docs/devlog/2026-10-23-story-screen.md`. What a desktop browser cannot show:

- **Android, the reading font.** Open any story. The prose should be in a
  serif (Noto Serif). A sans-serif means the `Georgia, 'Noto Serif', serif`
  stack fell through and something has to be bundled.
- **Android, the keyboard.** Tap "What do you do?". The input bar should sit
  just above the keyboard with the last line of the story visible above it,
  and drop back when the keyboard closes. Failure looks like the bar hidden
  behind the keyboard or a gap under it.
- **Android, the mic in the bar (solo story).** Tap 🎙. The first time, the
  phone should ask for the microphone once (the #223 permission path); then
  the input turns into a recording bar with a moving waveform. Stop talking
  for 3 s or tap ✓: the words should land in the input box, **not be sent**.
  Tap ▶: the GM's turn should treat it as voice input (it may mention
  transcription errors). Needs a Mistral key; one short STT call.
- **Read aloud, the slim player.** On a solo story, tap the latest turn, then
  the speaker icon. A slim player (play/pause, seek) should appear above the
  input while it reads, **stay** when paused, resume from where it paused,
  and go away when the reading ends. With auto-narrate on, a new turn should
  start reading by itself as before. Needs a TTS key; costs a little.
- **Couch co-op on the phone.** With two couch players: each bubble records
  for its player and queues a line; Generate sends them; the turn shows one
  line per speaker in their colour. Typing with ( ) on should send
  `> Name: (text)`.
- **iOS:** the first four, once a Mac build exists.
- **Online play (two devices):** the ☰ dot lights for a guest's unread OOC
  chat; the menu's Status row opens the chat and closes the sheet; a guest's
  voice and floor control behave as before.

## 2026-10-22 — Default systems PR C: Blood & Bone's content (`claude/default-systems-c`)

No display and no model key in this session. The suite checks the content's
budgets, titles, references and the core's tool recipes against the real
engine, and the library section and the panel render to static markup with
the real registry; nothing was seen on a screen and no model read the core.
The screens first (checks a person performs), then the model play that
decision 76 reserves for the author.

- **Library section.** Library home. *Expected:* a "Built-in systems" section
  between "Jump back in" and "Folders" with Blood & Bone, its two packs
  (*Blood & Bone — Rules*, *Blood & Bone — Europe by Night*, note titles
  collapsible) and *The Hollow Hour* with Play and "Open a copy in the
  Designer". *Failure:* no section (the registry did not load), or a pack
  showing a handful of notes instead of ~31 and 7.
- **Start the starter.** Play *The Hollow Hour*. *Expected (edited
  2026-10-23: the form it named is gone, decision 129):* no picker and no
  form; the story opens on the intro in session zero, and the GM builds the
  character from the Blood & Bone sheet in conversation (Kind, Archetype, Path,
  five stats, Stress triggers, Connections, background). After `start_game`
  the Lore page's panel shows Heat 3/6 ("A pattern" under it) and three vows
  in the Cohort group at 0 of 10 boxes. The note list shows the
  Blood & Bone notes, *The Hollow Hour — Running it* and *The truth about
  Runa* (hidden). *Failure:* no panel (the story has no `meters`), or two
  copies of every note (the pack was attached on top of the starter's).
- **Open a copy.** "Open a copy in the Designer" on the starter. *Expected:*
  "The Hollow Hour (copy)" in Adventures, opening in the Designer with all
  notes, three NPCs, Heat and the vows; the Inspector's Rules switch reads
  "Automatic (on: Blood & Bone)". Save and play the copy: Heat and the vows
  are still there. (Edited 2026-10-23, read from the code and not yet played:
  every new story now starts in session zero, a copy's included, since the
  story start sets the flag for every adventure. The GM still reads *Running
  it*, which says what to do without a Campaign Plan.)
- **The picker.** From the Designer's or the in-game lore editor's import:
  *Expected:* chips "Built-in: Blood & Bone — Rules" and "… — Europe by
  Night"; importing the rules into a draft with no sheet template sets the
  Blood & Bone sheet, and importing twice leaves one copy of each note.
- **A phone does not see the rules.** Run party mode on a Blood & Bone story;
  a phone's page must show only that player's sheet, the narration and
  choices: no *Core rules*, no *The truth about Runa*. (Covered by
  `tests/party.redaction.test.ts` with the real starter; this is the on-device
  confirmation.)
- **Session zero and a played night (a real model, the author's keys).** On
  models the author picks (decision 76): play *The Hollow Hour* through
  session zero (the GM reads *B&B — Character creation*, walks the steps,
  creates the character's meter set with `create_set` and the vow with
  `manage_track`, writes the Campaign Plan and calls `start_game`), then one
  feeding scene, one Rule of 3 fight and one dawn. *Expected:* Stress rises
  once per trigger per scene (a repeat is refused and the GM does not
  retry), the fight is `start_challenge` in tally mode with one `action_roll`
  and one `record_challenge_result` per player turn and the tally shown on
  the Lore panel, dawn is `end_session` followed by the Reckoning (a
  `formula_roll` of Stress d6, the GM counting the 1s) and a Beast `adjust`
  by exactly that count; the Beast thresholds are acted on (`set_cap` at 6
  and 9). *Failure looks like:* the GM rolling `formula_roll` for the action
  roll, using `start_combat`, forgetting `increment_scene` (every trigger
  then stays capped for the whole night), skipping the Reckoning, or
  softening or refusing the feeding scene (the first thing decision 76 wants
  to know; note which model).
- **The core note is the author's to read** before this PR merges (plan 9.5):
  it is game design in the GM's voice. Read *B&B — Core rules* (Library home,
  Blood & Bone — Rules) and mark any rule that is wrong.
- **Dice tray.** With physical dice on, an `action_roll` throws one d6 and two
  d10s in one toss (still only the request shape is tested).

## 2026-10-22 — Default systems PR B: the screens and the library (`claude/default-systems-b`)

No session had a display, so none of this was seen running. The tests render
the panel and the Library section to static markup and run the import rule,
the converters and the starter through `startAdventureLocally`. **Blood &
Bone landed in PR C, so all five checks below can now be run on the author's
machine** (PR C's own section repeats them against the real data).

- **The panel.** Open a Blood & Bone story in the desktop app, Lore page.
  *Expected:* a "Meters and tracks" card above "Story Notes": Stress, Beast,
  Exposure and XP bars for the character, Heat for the world, the vow's ten
  boxes, and during a skirmish the round and tally. A lowered Stress cap dims
  the part of the bar above it; a threshold shows its label under the bar;
  collapsing works. *Failure looks like:* the card missing on a system story
  (the story has no `meters`), or an empty gap above the notes on a story
  with no system (it should leave no gap).
- **Built-ins in the library.** Library home. *Expected:* a "Built-in systems"
  section with Blood & Bone, its packs (collapsible note titles) and *The
  Hollow Hour*. *Play* opens the "Bring a Character or Notes" picker and
  starts the story with the meters and the vow. *Open a copy in the Designer*
  creates "The Hollow Hour (copy)" under Adventures and opens it in the
  Designer with its notes, the rules switch showing "Automatic (on: ...)".
  Save it again and play it: the world Heat and the vows must still be there.
- **The picker.** From Play, or the Designer's import, or the in-game lore
  editor's import: *Expected:* chips "Built-in: Blood & Bone - Rules" and so
  on at the front of the row; selecting one shows its notes and "Select whole
  pack". Importing into a Designer draft with no sheet template says so in the
  transcript and the draft gets the Blood & Bone template. Importing the same
  pack twice leaves one copy of each note.
- **The guard.** In a story that has a built-in note, open the Lore page,
  select it and press Push to library (and the same in the in-game lore
  editor). *Expected:* a warning toast, "Built-in notes can't be changed in the
  library", and nothing written; Pull refreshes it from the built-in text.
- **Phone width.** The panel's two columns collapse to one on a phone and the
  track boxes stay on one row; check on the Android app.

## 2026-10-22 — Better scene pictures (`claude/image-quality`, decision 111)

Needs a fal key and costs a few cents a picture, so it waits for the author.

- **The new default model.** With no scene model chosen (or one saved before
  this change), press Illustrate this on a turn. The caption under the picture
  should say FLUX.2 [pro] and about $0.03, not FLUX.1 schnell.
- **The brief keeps telling traits.** In The Hollow Seat, illustrate the turn
  where Bryn taps the table with his stump. The Debug Logs' "Picture
  description" line should name a missing arm, and the picture should show one.
  Failure: a brief that says only "two figures at a table" means the writer is
  not getting the NPC notes (check the NPC is named in the turn's text).

## 2026-10-22 — Microphone and TTS on Android (`claude/android-mic-tts`)

No phone was connected to this PC, so the APK was built but not run.

- **Microphone prompt.** On a fresh install, open a story and tap the mic
  button. Android should ask "Allow Your Story to record audio?"; allow it,
  speak, and the words should appear in the action box (needs a Mistral key).
  Failure: no prompt and a "microphone not allowed" message means the
  manifest permissions did not reach the build.
- **TTS plays.** With a Cartesia or ElevenLabs key and TTS on, play a story
  part. It should be read aloud. Failure: silence, or a decode error in the
  Debug Logs, means the audio still comes through the patched fetch as text.
- **iOS microphone prompt** (needs a Mac or `build-apps.yml`): the same mic
  check should show the system prompt with the usage text from `Info.plist`.

## 2026-10-22 — Default systems PR A: the engine (`claude/default-systems-a`)

The suite covers every tool through `executeGMTools`, the state sections, the
offered tool list and its token bound. No model was called. The tools are
offered only to a story that runs a system; since PR C, a story started from
*The Hollow Hour* (or with the Blood & Bone rules imported), or an adventure
with the Inspector's Rules switch set to On, gets them.

- **The system tools through a real model.** Start *The Hollow Hour* (or any
  adventure with the Rules switch On), and tell the GM to
  create a Stress meter for you and raise it twice, make a vow, mark it and
  roll its progress. *Expected:* `manage_meter`/`manage_track` calls with
  valid arguments, results in the tool log, the "Meters & tracks" lines in
  the Debug Logs context. *Failure looks like:* an "invalid arguments" error
  on a tool; the schema description to fix is the one named.
- **A tally fight on a default model.** Ask the GM to start a three-round
  tally challenge and play three turns. *Expected:* one `action_roll` per
  turn, `record_challenge_result` with `strong_hit`/`weak_hit`/`miss`, the
  "Active challenge" line in the context each turn, and a close at round 3.
  *Failure looks like:* the GM using `success`/`failure` (the engine refuses
  and says why) or rolling twice a turn.
- **The physical dice tray with `action_roll`.** With physical dice on, an
  `action_roll` should throw one d6 and two d10s in one toss and use their
  faces. Only the request shape is tested (one throw of `1d6` and `2d10`).
- **Gemini.** The challenge tools are still dropped by the stale Google
  filter (status report 6.14); the new tools were added to it.

## 2026-10-22 — Token savings PR T3: the trimmed tool list and the note limits (`claude/token-savings-t3`)

The suite checks the list's size and stability and the cap's arithmetic; no
model was called and no screen was looked at.

- **The GM still calls every tool correctly on the trimmed descriptions.**
  Play a real session (any default model) that uses a roll, a fate question,
  a combat with two or more combatants added in one call, a timer and a
  campaign-plan beat change. *Expected:* no more "invalid arguments" tool
  errors than before, and combatants added in one `add_combatant` call.
  *Failure looks like:* a tool called with a wrong or missing argument that
  the old description spelled out; the Debug Logs show the call and the error.
  The description to restore is the one named in the error. Nobody has watched a
  model use the trimmed descriptions.
- **The warning beside a long pinned note.** In the Adventure Inspector (the
  Game Designer page), edit a DM instructions note and paste about 3,500
  tokens (roughly 2,600 words) into it. *Expected:* an amber line under the
  note, "This note is about 3,5xx tokens and is sent to the GM in full every
  turn...". The same line under the content box in a story's lore editor for a
  character sheet or a campaign plan, and none for an ordinary lore note.
  *Failure looks like:* no line, or one on a note the GM reads on demand.
- **The cap, in a real story.** Give a story DM instructions of about 9,000
  tokens and a campaign plan of about 6,000, play one turn, and open the
  context viewer. *Expected:* each note ends with `[… N more tokens:
  read_notes "Title" for the rest]` and the Debug Logs (browser console) say
  "Pinned notes over the 10000-token cap". *Failure looks like:* the whole
  note in the prompt, or the GM editing the plan from the shortened text and
  losing the rest (it should read the note first; if it does not, the
  campaign-plan pointer needs a stronger line).

## 2026-10-22 — Token savings PR T2: the stable prefix and provider caching (`claude/token-savings-t2`)

The suite measures the layout against a recording `fetch` (consecutive turns
share 11,165 of 14,598 message tokens, from 0) and the provider bodies against
a mocked one; no model was called. Decision 105: one real session on the
default models, after this merges, with the author's go. Cached tokens are in
the cost ledger (slice 7): the Turn Cost panel shows "N% of input from cache"
for the last turn, and the Debug Logs' "AI generation complete" line logs
`cachedTokens` and `cacheWriteTokens`.

- **The cache share on screen.** After a second turn on any cached model,
  open Settings' Turn Cost panel. *Expected:* "N% of input from cache" beside
  the token counts, above 0. The panel line was never seen rendered (no
  browser in the building session).

- **Mistral's cache.** Play two turns on a Mistral Small model.
  *Expected:* after the first round, `cachedTokens` is above 0 in the Debug
  Logs. *Failure looks like:* never above 0 (Mistral ignores the key), or a
  "Mistral rejected prompt_cache_key - retrying without it" line (rejected;
  it is skipped for the rest of the session and play carries on).
- **Cross-turn hits.** On DeepSeek, play three turns. *Expected:* turn 2
  onwards shows most of round 1's input cached (the stable prefix is
  everything but the live block and the action). *Failure looks like:* 0
  cached on every first round, which means the prefix is still changing;
  compare two turns' requests in the Debug Logs.
- **Claude's round mark and tool results (Claude via OpenRouter, if played).**
  The round mark never lands on a `tool` message (OpenRouter types a tool
  message's content as a string); it walks back to the last assistant or
  user message with text, or is left off. A turn with tool calls and some
  assistant text. *Expected:* round 2 onwards shows cache reads for the part
  up to that text. *Open question, a possible later gain and not a crash
  risk:* would OpenRouter accept `cache_control` on a tool message's content
  parts? If it does, the mark could sit on the latest tool result and cache
  the whole round.
- **Claude, five minutes apart.** Turns more than five minutes apart should
  not read cache (decision 104 decides whether to move to the 1-hour cache).
- **The subscription route.** On the desktop, one turn on a Claude
  (subscription) model. *Expected:* the system prompt file holds the stable
  block and history (check the "Claude CLI run" log line's sizes), and the
  second round's request starts the same.
- **The GM's behaviour with its nudges next to the action.** Five turns in a
  story with a pacing note and the GM tip. *Expected:* nothing odd; the Observer
  flags no more than before. *Failure looks like:* the GM quoting a note back
  to the player.
- **OpenRouter reasoning replay on Gemini.** A tool-calling turn on a Gemini
  model through OpenRouter. *Expected:* a normal turn, with no 400 about a
  thought signature.

## 2026-10-22 — Pictures in play, PR I1 (`claude/image-gen-i1`)

The suite drives the queue, the executor, the fal call and a real
`generateStoryTurn` against injected providers and a fake IndexedDB; no fal,
DeepInfra or OpenRouter image call was made, because each needs the author's
key and spends their money. Nothing was seen rendered either (no browser in the
session that built it). Everything below waits for the author's go and a fal
key (`https://fal.ai/dashboard/keys`). About $0.10 covers the four fal checks.

**Gate for slice S7 (reference pictures, not built).** Do these four first;
they decide whether S7 is a small change or needs fal's storage upload
(design §10):

1. One schnell picture with `sync_mode: true` (Settings → API Keys → fal key,
   then **Illustrate this** on any turn). *Expected:* a picture under the turn
   within a few seconds, and in Debug Logs an "Image: scene picture … done"
   line. Note how long it took. *Failure looks like:* a "Picture failed: fal
   returned …" card. A `data:` URI is expected back; if fal returns an https
   URL the code fetches it once (the `https://*.fal.media/*` allowlist entry
   is for that), so a failure there names `fal.media`.
2. One FLUX.2 [pro] portrait (NPCs page → **Make portrait**). *Expected:* the
   portrait on the NPC's row and in the detail header.
3. One FLUX.2 [pro] edit with that portrait as a `data:` URI in `image_urls`
   (needs S7: `imageJobs.resolveReferencePictures` returns none until then).
   Run it by hand with `curl`, or in a scratch build: is a `data:` URI
   accepted, and is the face kept?
4. One prompt fal should refuse (an explicit one). *Expected:* a "The image
   service declined this one" card, not a black picture. Write the real 422
   body down: `falImageCall.readPolicyViolation` guesses at `ctx.categories`
   and `ctx.tags` for the category names, so an empty category list on the card
   is not a failure but a hint to read the body.

**Added after the engine review (PR #219):**

- **Does `AbortSignal` cancel a request in both native fetches?** Tauri's
  scoped HTTP plugin and `CapacitorHttp` (Android and iOS). Start a picture on
  DeepInfra or fal, press Stop (or Undo) while "Painting…" shows. *Expected:*
  the card ends "Cancelled" at once, and the provider call stops (Debug Logs
  shows no later "done"). *Failure looks like:* the request keeps running
  until it answers; the result is still dropped (not saved, billed or
  attached, `imageJobs.runJob`), so the cost is only time and the provider's
  own bill.
- **Does a 1–3 MB base64 `sync_mode` response arrive intact through both
  native fetches?** One FLUX.2 [pro] portrait on the desktop and on the APK.
  *Expected:* a normal picture. *Failure looks like:* a "Picture failed" card
  mentioning JSON, or a truncated or garbled picture.
- **Do DeepInfra and OpenRouter answer with a link instead of bytes, and which
  host?** The code fetches a link once (`imageFetch.ts`), but the desktop
  allowlist has no entry for those image hosts. If a card reads "Could not
  fetch the picture: …" naming a host, add it to
  `src-tauri/capabilities/default.json` and rebuild.
- **Clear this story's pictures.** Make a portrait, Clear (Story Editor →
  Story → Pictures), then ask the GM for that NPC's portrait. *Expected:* the
  GM is not told "already has a portrait", and the NPC row shows its emoji
  again.
- **Leave the story while a picture paints**, open another story, wait. *Expected:*
  the other story is untouched; on reopening the first, the picture is on its
  NPC or turn.

**The built apps (`tauri build` launched, then the APK):**

- **The allowlist.** In the desktop app with a fal key, press **Illustrate
  this**. *Expected:* a picture. *Failure looks like:* a card reading "fal
  returned …" or a network error in the first second, which means
  `https://fal.run/*` is not in `src-tauri/capabilities/default.json`'s `http`
  scope in the shipped build. `CapacitorHttp` carries it on Android with no
  entry; check there too.
- **A GM picture.** Play with a fal key and a story whose GM is told to
  introduce a new place. *Expected:* at most two pictures per scene
  (Settings → Images), each a card under that turn's prose; the pill reads
  "Painting a picture"; the prose never mentions the picture; the turn cost
  panel shows a "Pictures" row. *Failure looks like:* a picture every turn
  (the cap is not holding), or a GM that says "here is a picture of…".
- **Stop while one paints.** Start a turn, press Stop while "Painting…" shows.
  *Expected:* the card ends as "Cancelled" with a Retry, nothing is saved, and
  the Pictures row stays at zero.
- **Reload.** Reload mid-paint, then after. *Expected:* a finished picture is
  still there; one cut off by the reload shows "This picture isn't on this
  device" with **Regenerate**; Debug Logs shows no error.
- **A portrait for the NPC the GM introduces.** *Expected:* the GM asks for it
  once ("already has a portrait" after that), and it shows in the NPC list, the
  detail view and the reaction toast.
- **Online play.** As a guest, join a room where the host has pictures.
  *Expected:* each card reads "Picture on the host's screen"; no Illustrate
  button; no Make portrait button (decision 60).
- **Android WebView.** A picture's size in **Settings → Images → space used**
  should be about 100–200 KB. *Failure looks like:* megabytes per picture,
  which means the WebView lacks `OffscreenCanvas` and `imageShrink.ts` stored
  the original bytes.
- **DeepInfra and OpenRouter sizes.** With only a DeepInfra key, paint a scene
  (1024×768) and a portrait (768×1024). *Expected:* both come back. *Failure
  looks like:* a 400 naming `size` for one of the models; pin the model in
  Settings → Images and note which size it refuses.
- **Screens to look at (none was seen rendered):** Settings → Images; the
  fal.ai block under API Keys; the Pictures block at the bottom of the Story
  Editor's Story section; the pending, done, declined, failed and missing
  cards under a turn; the **Illustrate this** button beside the voice controls
  at phone width; the NPC detail header with its **Make portrait** button; the
  character sheet's portrait block.


## 2026-10-22 — Token savings PR T1: history stubs, fixed start, summaries (`claude/token-savings-t1`)

The suite measures the history sizes and the summary prompt against a
recording `fetch`; no model was called. What needs a real session on the
default models (with the author's go, decision 105):

- **Recall after a stub.** Let the GM read a note, then play twenty turns.
  *Expected:* it still acts on what the note said, or reads it again (the
  stub tells it to). *Failure looks like:* a wrong fact stated with
  confidence, or a `read_notes` of the same note every turn, which means the
  150-token threshold or the summary needs tuning (decision 103).
- **A real summary.** Play past the history budget (21.6k tokens at the
  default Memory Size; shrink the slider to reach it sooner). *Expected:* one
  "History summarization" call in the Debug Logs, a story-so-far with the
  seven headings, and the next turns' history starting right after it.
  *Failure looks like:* a "sliding-window fallback" log line every turn (the
  summary call is failing; its error is in the Debug Logs), or headings
  missing from the summary.
- **Summary instructions.** Add a "Summary Instructions" note ("always keep
  Exposure and Heat changes"), play past a summary. *Expected:* the summary
  keeps them. The note must not appear in the GM's note lists.
- **Summarise Now.** Story menu, Compact Story, type a focus, Summarise Now.
  *Expected:* a success toast, the story text unchanged on screen, and the
  next turn's context (Context Viewer) opening with the summary and the last
  two turns only.
- **The Compact Story dialog on a phone width.** The new Summarise Now block
  was never seen rendered (no browser in this session).

## 2026-10-21 — The model catalog refresh (`claude/catalog-refresh`)

The catalog was checked against OpenRouter's live list and each vendor's
pricing page, and the fallback for removed models is covered by tests. What
no session could do is call the new models: each needs a provider key and
spends the author's money, so each waits for the author's go. One short
request per item is enough.

- **The Designer on Grok 4.5 at effort `none` (the second engine review,
  2026-10-22).** With only an OpenRouter key and no Designer model saved, the
  Designer opens on Grok 4.5, the first catalog model the key unlocks. Its
  effort is `none`, and OpenRouter marks Grok's reasoning mandatory. Send one
  Designer message. *Expected:* a normal reply, with the request carrying
  `reasoning: {effort: "low"}` (the "Side call failed" warning names the
  effort if it fails). *Failure looks like:* a 400 naming `reasoning` or
  `effort`, which would mean the `reasoningMandatory` flag is missing on the
  model, or OpenRouter has changed which models refuse `"none"`.
- **A Mistral Small 4 Designer at effort `high`.** Mistral's reasoning models
  answer with `content` as a list of chunks. Send one Designer message.
  *Expected:* a normal reply in the chat. *Failure looks like:* an error
  naming `trim` or `[object Object]` in the chat, which would mean the
  non-streaming path is not unpacking the list.
- **Does `deepseek-v4-pro` still serve V4 Pro?** DeepSeek's release post says
  it would route to V4.1 Flash from 2026-09-14; its changelog and pricing page
  say it continues at its own price. Send one tiny request on "DeepSeek V4 Pro"
  with a DeepSeek key and look at the reply's `model` field in the Debug Logs.
  *Failure looks like:* a model name containing "flash", or a bill near
  $0.15 / $0.60 per M instead of $0.66 / ## 2026-10-21 — The model catalog refresh (`claude/catalog-refresh`)

The catalog was checked against OpenRouter's live list and each vendor's
pricing page, and the fallback for removed models is covered by tests. What
no session could do is call the new models: each needs a provider key and
spends the author's money, so each waits for the author's go. One short
request per item is enough.

- **The Designer on Grok 4.5 at effort `none` (the second engine review,
  2026-10-22).** With only an OpenRouter key and no Designer model saved, the
  Designer opens on Grok 4.5, the first catalog model the key unlocks. Its
  effort is `none`, and OpenRouter marks Grok's reasoning mandatory. Send one
  Designer message. *Expected:* a normal reply, with the request carrying
  `reasoning: {effort: "low"}` (the "Side call failed" warning names the
  effort if it fails). *Failure looks like:* a 400 naming `reasoning` or
  `effort`, which would mean the `reasoningMandatory` flag is missing on the
  model, or OpenRouter has changed which models refuse `"none"`.
- **A Mistral Small 4 Designer at effort `high`.** Mistral's reasoning models
  answer with `content` as a list of chunks. Send one Designer message.
  *Expected:* a normal reply in the chat. *Failure looks like:* an error
  naming `trim` or `[object Object]` in the chat, which would mean the
  non-streaming path is not unpacking the list.
- **Does `deepseek-v4-pro` still serve V4 Pro?** DeepSeek's release post says
  it would route to V4.1 Flash from 2026-09-14; its changelog and pricing page
  say it continues at its own price. Send one tiny request on "DeepSeek V4 Pro"
  with a DeepSeek key and look at the reply's `model` field in the Debug Logs.
  *Failure looks like:* a model name containing "flash", or a bill near
  $0.15 / $0.60 per M instead of $0.66 / $1.98 (off-peak). Then relabel or
  remove the entry.
- **Does a forced tool call work on Qwen 3.8?** The app sends `tool_choice`
  `auto` to `qwen/qwen3.8…` because a gateway documents a 400 for a forced call
  with thinking on, while OpenRouter lists the parameter as supported. In a
  combat scene on "Qwen 3.8 Max", check that a gated round still produces a
  roll (the gate's message does the forcing). To test the premise itself, send
  `tool_choice: "required"` by hand once; if it works, the safeguard
  (`modelRejectsForcedToolChoice`) can go.
- **Do the new direct ids work on their providers?** One short chat each:
  "Google Gemini 4 Argon" and "Google Gemini 3.8 Flash" (the `models/` prefix
  on Google's OpenAI-compatible endpoint), and "Mistral Large 4" (`mistral-large-4`,
  in public preview). *Failure looks like:* a 404 or "model not found". Also
  note what Google AI Studio bills for the `gemini-flash-latest` alias, which
  the two renamed "latest alias" entries still price from an older model.
- **A GM turn with tools on "DeepSeek V4.1 Flash"** (`deepseek-flash`): a roll
  and a second round, to see the `reasoning_content` replay work on the new
  name. *Failure looks like:* a 400 mentioning `reasoning_content`.
- **A GM turn on "GPT-6.1 Sol" or "GPT-6 Luna"** through OpenRouter. OpenRouter
  lists no `temperature` for them; check the call is not rejected for the
  sampling settings the app sends.
- **The lore image generator with a saved removed model.** The Settings
  fallback was checked in the preview (a tier, the narration voice and the
  Observer each saved as a removed model showed and ran their defaults). The
  image pickers were checked only as a function: with `loreImageGen_provider`
  `openrouter` and `loreImageGen_model` `Flux 2 Flex` saved in localStorage,
  opening a lore entry's image generator should show Nano Banana, not a blank
  or mismatched picker.

**The fixed models (2026-10-22).** Mistral's retired chat models were replaced
(Mistral Small 4, Medium 3.5, Ministral 3 3B and 8B), image prices and ids
were corrected, the OCR summariser and Cartesia TTS moved to their current
names. The ids were read from the vendors' own pages and the request shapes
are covered by tests with a faked `fetch`; none was sent to a provider.

- **A turn with tools on each new Mistral id, with only a Mistral key.**
  Save only a Mistral key, pin the narration voice to "Mistral Small 4" and
  tier 1 to the same, and play a turn that makes the GM roll. Repeat with
  "Mistral Medium 3.5" (`mistral-medium-3-5`), "Ministral 3 8B"
  (`ministral-8b-2512`) and "Ministral 3 3B" (`ministral-3b-2512`). *Expected:*
  the roll happens, the scene arrives, and the Debug Logs name the Mistral id.
  *Failure looks like:* a 404 or "model not found" (the id), a 400 naming
  `tool_choice`, `max_tokens` or `reasoning_effort` (Small 4 and Medium 3.5
  reason, and Mistral may take effort differently from the one value the app
  sends them), or a 400 about the prompt size on Ministral 3 3B (Mistral's page
  says 256k, OpenRouter lists 128k; the catalog follows Mistral).
- **A saved choice of a retired Mistral model.** In localStorage set
  `narrationModelOverride` to `Mistral Small 3.2`, `reasoningTierOverrides`
  to `[{"modelKey":"Mistral Medium 3.1","reasoningEffort":"low"},null,null,null]`,
  `observerModelOverride` to `{"modelKey":"Mistral Nemo","reasoningEffort":"none"}`
  and `designerModel` to `Devstral 2`, with only a Mistral key saved, and reload.
  *Expected:* Settings → AI Config shows Mistral Small 4, Mistral Medium 3.5
  and (Architecture) Ministral 3 8B, `/creator` opens on Mistral Medium 3.5, and
  a turn runs without asking for an OpenRouter key. *Failure looks like:* a
  blank picker, "No key" on a slot that has a Mistral key, or a "Model key …
  not found" line. The PDF importer has its own saved id: set
  `pdfImporterSettings` to `{"aiModel":"mistral-small-2506"}`; the importer's
  model picker should open on Mistral Small 4.
- **A narration line on Cartesia.** With a Cartesia key and a voice ID (try
  the bundled Barbershop Man, and a Professional Voice Clone if you have one),
  switch the voice model to Cartesia and play a narration line. The request
  now carries `Cartesia-Version: 2026-08-14`, `model_id: "sonic-3.6"` and
  `voice` as a string. *Expected:* audio plays. *Failure looks like:* a 400
  with `voice_model_mismatch` on a Professional Voice Clone (Cartesia wants one
  of the voice's own models, `sonic-3.5-2026-05-04` or `sonic-3.6-2026-08-27`,
  and the app sends the undated `sonic-3.6`; if so, the voice needs a model
  field), a 400 naming `voice` or `model_id`, or silence. If it fails for every
  voice, revert `CARTESIA_VERSION` and `CARTESIA_MODEL_ID` in `ttsCall.ts`.
- **One Nano Banana Pro image.** With an OpenRouter key, generate a lore image
  on "Nano Banana Pro" (now `google/gemini-3-pro-image`). *Expected:* an image,
  at about $0.13 in the OpenRouter activity page (the picker shows ~$0.134).
  Then "Nano Banana" (now `google/gemini-3.1-flash-lite-image`, ~$0.034) and
  "GPT-5.4 Image 2" (`openai/gpt-5.4-image-2`, ~$0.045, an estimate). *Failure
  looks like:* "Could not extract image from AI response" (the model returns
  the picture in a shape `extractImageFromOpenRouterResponse` does not read),
  a 404, or a cost far from the figure shown.
- **A DeepInfra image.** Generate a lore image on "FLUX 2 Pro" and on
  "Bria 3.2". *Expected:* about $0.03 and $0.04 on DeepInfra's usage page.
- **The OCR summariser on DeepSeek.** Import a short PDF with the importer's
  model set to a DeepSeek model (its request now names `deepseek-flash`).
  *Failure looks like:* a 400 naming the model.

**The Balanced defaults (decisions 50 and 51).** The default ladder and the
side agents' own default changed in this same branch. Every item here plays
real turns on the author's OpenRouter key, so it waits for the author's go.

- **A fresh profile, one OpenRouter key, four turns.** Clear the saved
  overrides (Settings → AI Config → "Reset all to defaults", and every
  Architecture toggle off), save only an OpenRouter key, and play one banter
  turn, one ordinary check, one combat turn against two enemies (tier 2) and
  one against a single enemy (tier 3, which counts as a boss). *Expected:*
  tiers 0 and 1 run on Claude Haiku 5.5, tier 2 on GLM 5.3, tier 3 on Claude
  Sonnet 5.5, narration on GLM 5.3, and the Observer's judges and the Memory
  Keeper on Claude Haiku 5.5, all visible in the turn cost panel or the Debug
  Logs. *Failure looks like:* a 400 from Claude naming `tool_choice` or a
  forced tool use on a gated round, or naming thinking blocks when the GM
  climbs from Haiku to Sonnet mid-turn; a side-agent line in the Debug Logs
  naming DeepSeek V4 Flash or `Model key … not found`, which means a side
  call still reaches `getModelConfig()` with a key it does not know (a missed
  fallback path); a GLM 5.3 reply that comes back empty because its thinking
  used the whole token cap.
- **A climb to tier 3 in the middle of a turn, from GLM 5.3 and from Haiku.**
  In a combat scene against two enemies (tier 2, GLM 5.3), make the GM raise
  the tier mid-turn: a `formula_roll` with `stakes: "deadly"` raises it
  through `applyStakesEscalation`, so the next round runs on Claude Sonnet
  5.5. Then do the same from an ordinary scene (tier 1, Haiku). *Expected:*
  the Sonnet round succeeds, with the GM's earlier rounds in its history.
  *Failure looks like:* a 400 from Anthropic or OpenRouter naming
  `reasoning_details`, thinking blocks or a signature. That would mean the
  earlier model's reasoning must not be replayed to Claude when the model
  changes inside a turn. The turn then errors out instead of falling back,
  because the tier fallback does not fire for streamed rounds (a provider
  error arrives as an in-stream `error` event; see the `REASONING_TIERS`
  comment in `reasoningTiers.ts`).
- **A gated combat round on GLM 5.3.** In the same two-enemy combat, provoke
  the roll gate (M2) or the plan gate, so that round is forced to
  `tool_choice: "required"` and goes out through OpenRouter to GLM 5.3.
  *Expected:* the gated round calls a tool (a roll). *Failure looks like:* a
  400 naming `tool_choice`, or the model answering in prose again so the gate
  fires a second time.
- **The cap on a tier 3 turn.** Against a single enemy (tier 3, Claude Sonnet
  5.5 at `xhigh`), with the default Response Length of 8,000, read the final
  story round in the Debug Logs. Thinking counts against `max_tokens` on
  Claude, so `xhigh` can use up the cap. *Expected:* the round's finish
  diagnostic shows `truncatedAtCap: false` and the scene arrives whole.
  *Failure looks like:* `truncatedAtCap: true`, an empty final story round,
  or a scene that stops mid-sentence; then tier 3's effort or the 4,096
  `max_tokens` floor needs another look.
- **Haiku's thinking on the side calls.** An unpinned side agent sends effort
  `none` (decision 53), and Claude 5.5's thinking cannot be turned off, so
  `applyReasoningEffort` sends Claude's `none` as `low`, as its GLM branch
  already did. After the four turns above, read the Observer and
  Memory Keeper lines in the turn cost panel. *Failure looks like:* a side
  call costing several times a tenth of a cent, or taking several seconds,
  which would mean OpenRouter is not honouring `reasoning.effort: low` for
  Haiku.
- **The Observer's rewrite on the narration voice (decision 52).** The
  Observer's judges run on Claude Haiku 5.5, but an unpinned Observer's
  rewrite runs on the narration voice (GLM 5.3 by default). In a story with
  violence or mature themes, let the Observer flag a turn (a player-agency or
  outcome mismatch is the easiest to provoke), and read the rewrite's line in
  the Debug Logs. *Expected:* the judge calls name Claude Haiku 5.5 and the
  rewrite call names GLM 5.3, and the rewritten scene keeps its tone.
  *Failure looks like:* a rewrite call naming Haiku (a call site still on the
  judges' options), a refusal or a softened scene, or "Observer rewrite call
  failed, falling back to full-turn reset" every time.
- **An existing profile with only a Mistral or DeepSeek key.** Its saved
  overrides still apply, but a slot with none now defaults to an OpenRouter
  model. *Expected:* a turn that stops with a message naming the missing
  OpenRouter key, and the Settings tier cards showing "No key"; saving an
  OpenRouter key (or picking models on the key it has) fixes it.
- **An OpenRouter-less profile keeps its side agents.** Clear every saved
  override and every key, save only a Mistral key, set the four tiers and the
  narration voice to Mistral models in Settings → AI Config, and play until
  compaction runs (a long story, or a small Memory Size). *Expected:* the turn
  plays, and the Memory Keeper, the Observer and compaction lines in the Debug
  Logs name the Mistral narration model (the side agents fall to the
  narration voice when there is no key for Claude Haiku 5.5's provider), with
  a scene summary appearing once compaction has run. *Failure looks like:* a
  side-agent line naming Claude Haiku 5.5 followed by "No API key configured
  for OpenRouter", or a story whose old history drops out with no summary
  (compaction never ran). The "Compact Story" button in the story menu should
  work on the same profile, on the same model.

**Every call carries an effort (decision 53).** Built and tested against
mocked providers only; the requests below spend the author's OpenRouter key.

- **The narration voice and the Designer at a chosen effort.** In Settings →
  AI Config set the narration voice to Claude Sonnet 5.5 and its new effort
  picker to `high`, and play one turn that needs a separate narration call
  (the GM's last round only calls tools) with suggested choices on. Then open
  `/creator`, set the Designer's model to Claude Sonnet 5.5 and its Effort
  picker to `normal`, and send one message. *Expected:* the "Story stage
  request sent" line in the Debug Logs shows `reasoningEffort: high`; in the
  web preview's network tab the story and choices requests carry
  `"reasoningEffort":"high"` and the Designer's `"normal"`, while the
  Observer's judges and the Memory Keeper carry `"none"` (OpenRouter then
  receives `reasoning: {effort: "low"}` for them, Claude's reading of `none`,
  and `{effort: "high"}` and `{effort: "medium"}` for the other two). A failed
  side call's Debug Logs warning also names the effort it was sent at.
  *Failure looks like:* every call still at `low` (the effort is not reaching
  the request), or a 400 naming `reasoning` (a model that does not take the
  effort the picker offered).
.98 (off-peak). Then relabel or
  remove the entry.
- **Does a forced tool call work on Qwen 3.8?** The app sends `tool_choice`
  `auto` to `qwen/qwen3.8…` because a gateway documents a 400 for a forced call
  with thinking on, while OpenRouter lists the parameter as supported. In a
  combat scene on "Qwen 3.8 Max", check that a gated round still produces a
  roll (the gate's message does the forcing). To test the premise itself, send
  `tool_choice: "required"` by hand once; if it works, the safeguard
  (`modelRejectsForcedToolChoice`) can go.
- **Do the new direct ids work on their providers?** One short chat each:
  "Google Gemini 4 Argon" and "Google Gemini 3.8 Flash" (the `models/` prefix
  on Google's OpenAI-compatible endpoint), and "Mistral Large 4" (`mistral-large-4`,
  in public preview). *Failure looks like:* a 404 or "model not found". Also
  note what Google AI Studio bills for the `gemini-flash-latest` alias, which
  the two renamed "latest alias" entries still price from an older model.
- **A GM turn with tools on "DeepSeek V4.1 Flash"** (`deepseek-flash`): a roll
  and a second round, to see the `reasoning_content` replay work on the new
  name. *Failure looks like:* a 400 mentioning `reasoning_content`.
- **A GM turn on "GPT-6.1 Sol" or "GPT-6 Luna"** through OpenRouter. OpenRouter
  lists no `temperature` for them; check the call is not rejected for the
  sampling settings the app sends.
- **The lore image generator with a saved removed model.** The Settings
  fallback was checked in the preview (a tier, the narration voice and the
  Observer each saved as a removed model showed and ran their defaults). The
  image pickers were checked only as a function: with `loreImageGen_provider`
  `openrouter` and `loreImageGen_model` `Flux 2 Flex` saved in localStorage,
  opening a lore entry's image generator should show Nano Banana, not a blank
  or mismatched picker.

**The fixed models (2026-10-22).** Mistral's retired chat models were replaced
(Mistral Small 4, Medium 3.5, Ministral 3 3B and 8B), image prices and ids
were corrected, the OCR summariser and Cartesia TTS moved to their current
names. The ids were read from the vendors' own pages and the request shapes
are covered by tests with a faked `fetch`; none was sent to a provider.

- **A turn with tools on each new Mistral id, with only a Mistral key.**
  Save only a Mistral key, pin the narration voice to "Mistral Small 4" and
  tier 1 to the same, and play a turn that makes the GM roll. Repeat with
  "Mistral Medium 3.5" (`mistral-medium-3-5`), "Ministral 3 8B"
  (`ministral-8b-2512`) and "Ministral 3 3B" (`ministral-3b-2512`). *Expected:*
  the roll happens, the scene arrives, and the Debug Logs name the Mistral id.
  *Failure looks like:* a 404 or "model not found" (the id), a 400 naming
  `tool_choice`, `max_tokens` or `reasoning_effort` (Small 4 and Medium 3.5
  reason, and Mistral may take effort differently from the one value the app
  sends them), or a 400 about the prompt size on Ministral 3 3B (Mistral's page
  says 256k, OpenRouter lists 128k; the catalog follows Mistral).
- **A saved choice of a retired Mistral model.** In localStorage set
  `narrationModelOverride` to `Mistral Small 3.2`, `reasoningTierOverrides`
  to `[{"modelKey":"Mistral Medium 3.1","reasoningEffort":"low"},null,null,null]`,
  `observerModelOverride` to `{"modelKey":"Mistral Nemo","reasoningEffort":"none"}`
  and `designerModel` to `Devstral 2`, with only a Mistral key saved, and reload.
  *Expected:* Settings → AI Config shows Mistral Small 4, Mistral Medium 3.5
  and (Architecture) Ministral 3 8B, `/creator` opens on Mistral Medium 3.5, and
  a turn runs without asking for an OpenRouter key. *Failure looks like:* a
  blank picker, "No key" on a slot that has a Mistral key, or a "Model key …
  not found" line. The PDF importer has its own saved id: set
  `pdfImporterSettings` to `{"aiModel":"mistral-small-2506"}`; the importer's
  model picker should open on Mistral Small 4.
- **A narration line on Cartesia.** With a Cartesia key and a voice ID (try
  the bundled Barbershop Man, and a Professional Voice Clone if you have one),
  switch the voice model to Cartesia and play a narration line. The request
  now carries `Cartesia-Version: 2026-08-14`, `model_id: "sonic-3.6"` and
  `voice` as a string. *Expected:* audio plays. *Failure looks like:* a 400
  with `voice_model_mismatch` on a Professional Voice Clone (Cartesia wants one
  of the voice's own models, `sonic-3.5-2026-05-04` or `sonic-3.6-2026-08-27`,
  and the app sends the undated `sonic-3.6`; if so, the voice needs a model
  field), a 400 naming `voice` or `model_id`, or silence. If it fails for every
  voice, revert `CARTESIA_VERSION` and `CARTESIA_MODEL_ID` in `ttsCall.ts`.
- **One Nano Banana Pro image.** With an OpenRouter key, generate a lore image
  on "Nano Banana Pro" (now `google/gemini-3-pro-image`). *Expected:* an image,
  at about $0.13 in the OpenRouter activity page (the picker shows ~$0.134).
  Then "Nano Banana" (now `google/gemini-3.1-flash-lite-image`, ~$0.034) and
  "GPT-5.4 Image 2" (`openai/gpt-5.4-image-2`, ~$0.045, an estimate). *Failure
  looks like:* "Could not extract image from AI response" (the model returns
  the picture in a shape `extractImageFromOpenRouterResponse` does not read),
  a 404, or a cost far from the figure shown.
- **A DeepInfra image.** Generate a lore image on "FLUX 2 Pro" and on
  "Bria 3.2". *Expected:* about $0.03 and $0.04 on DeepInfra's usage page.
- **The OCR summariser on DeepSeek.** Import a short PDF with the importer's
  model set to a DeepSeek model (its request now names `deepseek-flash`).
  *Failure looks like:* a 400 naming the model.

**The Balanced defaults (decisions 50 and 51).** The default ladder and the
side agents' own default changed in this same branch. Every item here plays
real turns on the author's OpenRouter key, so it waits for the author's go.

- **A fresh profile, one OpenRouter key, four turns.** Clear the saved
  overrides (Settings → AI Config → "Reset all to defaults", and every
  Architecture toggle off), save only an OpenRouter key, and play one banter
  turn, one ordinary check, one combat turn against two enemies (tier 2) and
  one against a single enemy (tier 3, which counts as a boss). *Expected:*
  tiers 0 and 1 run on Claude Haiku 5.5, tier 2 on GLM 5.3, tier 3 on Claude
  Sonnet 5.5, narration on GLM 5.3, and the Observer's judges and the Memory
  Keeper on Claude Haiku 5.5, all visible in the turn cost panel or the Debug
  Logs. *Failure looks like:* a 400 from Claude naming `tool_choice` or a
  forced tool use on a gated round, or naming thinking blocks when the GM
  climbs from Haiku to Sonnet mid-turn; a side-agent line in the Debug Logs
  naming DeepSeek V4 Flash or `Model key … not found`, which means a side
  call still reaches `getModelConfig()` with a key it does not know (a missed
  fallback path); a GLM 5.3 reply that comes back empty because its thinking
  used the whole token cap.
- **A climb to tier 3 in the middle of a turn, from GLM 5.3 and from Haiku.**
  In a combat scene against two enemies (tier 2, GLM 5.3), make the GM raise
  the tier mid-turn: a `formula_roll` with `stakes: "deadly"` raises it
  through `applyStakesEscalation`, so the next round runs on Claude Sonnet
  5.5. Then do the same from an ordinary scene (tier 1, Haiku). *Expected:*
  the Sonnet round succeeds, with the GM's earlier rounds in its history.
  *Failure looks like:* a 400 from Anthropic or OpenRouter naming
  `reasoning_details`, thinking blocks or a signature. That would mean the
  earlier model's reasoning must not be replayed to Claude when the model
  changes inside a turn. The turn then errors out instead of falling back,
  because the tier fallback does not fire for streamed rounds (a provider
  error arrives as an in-stream `error` event; see the `REASONING_TIERS`
  comment in `reasoningTiers.ts`).
- **A gated combat round on GLM 5.3.** In the same two-enemy combat, provoke
  the roll gate (M2) or the plan gate, so that round is forced to
  `tool_choice: "required"` and goes out through OpenRouter to GLM 5.3.
  *Expected:* the gated round calls a tool (a roll). *Failure looks like:* a
  400 naming `tool_choice`, or the model answering in prose again so the gate
  fires a second time.
- **The cap on a tier 3 turn.** Against a single enemy (tier 3, Claude Sonnet
  5.5 at `xhigh`), with the default Response Length of 8,000, read the final
  story round in the Debug Logs. Thinking counts against `max_tokens` on
  Claude, so `xhigh` can use up the cap. *Expected:* the round's finish
  diagnostic shows `truncatedAtCap: false` and the scene arrives whole.
  *Failure looks like:* `truncatedAtCap: true`, an empty final story round,
  or a scene that stops mid-sentence; then tier 3's effort or the 4,096
  `max_tokens` floor needs another look.
- **Haiku's thinking on the side calls.** An unpinned side agent sends effort
  `none` (decision 53), and Claude 5.5's thinking cannot be turned off, so
  `applyReasoningEffort` sends Claude's `none` as `low`, as its GLM branch
  already did. After the four turns above, read the Observer and
  Memory Keeper lines in the turn cost panel. *Failure looks like:* a side
  call costing several times a tenth of a cent, or taking several seconds,
  which would mean OpenRouter is not honouring `reasoning.effort: low` for
  Haiku.
- **The Observer's rewrite on the narration voice (decision 52).** The
  Observer's judges run on Claude Haiku 5.5, but an unpinned Observer's
  rewrite runs on the narration voice (GLM 5.3 by default). In a story with
  violence or mature themes, let the Observer flag a turn (a player-agency or
  outcome mismatch is the easiest to provoke), and read the rewrite's line in
  the Debug Logs. *Expected:* the judge calls name Claude Haiku 5.5 and the
  rewrite call names GLM 5.3, and the rewritten scene keeps its tone.
  *Failure looks like:* a rewrite call naming Haiku (a call site still on the
  judges' options), a refusal or a softened scene, or "Observer rewrite call
  failed, falling back to full-turn reset" every time.
- **An existing profile with only a Mistral or DeepSeek key.** Its saved
  overrides still apply, but a slot with none now defaults to an OpenRouter
  model. *Expected:* a turn that stops with a message naming the missing
  OpenRouter key, and the Settings tier cards showing "No key"; saving an
  OpenRouter key (or picking models on the key it has) fixes it.
- **An OpenRouter-less profile keeps its side agents.** Clear every saved
  override and every key, save only a Mistral key, set the four tiers and the
  narration voice to Mistral models in Settings → AI Config, and play until
  compaction runs (a long story, or a small Memory Size). *Expected:* the turn
  plays, and the Memory Keeper, the Observer and compaction lines in the Debug
  Logs name the Mistral narration model (the side agents fall to the
  narration voice when there is no key for Claude Haiku 5.5's provider), with
  a scene summary appearing once compaction has run. *Failure looks like:* a
  side-agent line naming Claude Haiku 5.5 followed by "No API key configured
  for OpenRouter", or a story whose old history drops out with no summary
  (compaction never ran). The "Compact Story" button in the story menu should
  work on the same profile, on the same model.

**Every call carries an effort (decision 53).** Built and tested against
mocked providers only; the requests below spend the author's OpenRouter key.

- **The narration voice and the Designer at a chosen effort.** In Settings →
  AI Config set the narration voice to Claude Sonnet 5.5 and its new effort
  picker to `high`, and play one turn that needs a separate narration call
  (the GM's last round only calls tools) with suggested choices on. Then open
  `/creator`, set the Designer's model to Claude Sonnet 5.5 and its Effort
  picker to `normal`, and send one message. *Expected:* the "Story stage
  request sent" line in the Debug Logs shows `reasoningEffort: high`; in the
  web preview's network tab the story and choices requests carry
  `"reasoningEffort":"high"` and the Designer's `"normal"`, while the
  Observer's judges and the Memory Keeper carry `"none"` (OpenRouter then
  receives `reasoning: {effort: "low"}` for them, Claude's reading of `none`,
  and `{effort: "high"}` and `{effort: "medium"}` for the other two). A failed
  side call's Debug Logs warning also names the effort it was sent at.
  *Failure looks like:* every call still at `low` (the effort is not reaching
  the request), or a 400 naming `reasoning` (a model that does not take the
  effort the picker offered).

## 2026-10-21 — Party mode (PR P1): the checks that need real phones

What was verified here: the Rust server's checks (`cargo test`, including a
real WebSocket relay on loopback), the whole TypeScript table
(`tests/party.*.test.ts`), the phone page in a browser against the real
runtime (two players, a steal and its cooldown ring, Go, a roll and a question
routed to the right player, a reconnect, nothing secret on the wire), and,
on the author's own phone and PC, that a phone on this Wi-Fi reaches a server on
this PC (plan §7). **On 2026-10-22 the author ran the built `app.exe` with one
real phone:** the QR opened the join form, joining worked and showed a seat, the
spotlight and a typed line queued on the phone and on the desktop, and Go
reached the desktop (no key, so no real turn). Windows Firewall asked once for
`app.exe` and the author allowed Private. What follows is what that run did not
cover: more than one phone, a live key, and a few edges. Run it from the built app: `RUSTUP_TOOLCHAIN=1.99.1 npx tauri build`,
then `src-tauri/target/release/app.exe`.

- **The Windows Firewall prompt from an installed copy.** The built
  `app.exe` raised the prompt once and the author allowed Private (2026-10-22).
  Still to check: which boxes the prompt ticks by default (the spike's rule was
  created for Private and Public together), that a copy installed from the MSI
  or NSIS, which has a different path, raises its own prompt, and that
  declining it once leaves the lobby's "A phone can't connect?" help
  covering it.
- **Two or more phones.** Join with two, a different colour each. Each phone
  should see both names. Take the spotlight on one, then on the other: the
  first should show the amber ring counting 15 s down, and a tap to take it
  back inside that time should be refused with a toast. Move the cooldown
  slider in the Menu and steal again: the next ring should follow it.
- **Lines need the spotlight.** With the spotlight, a typed line appeared in
  the queue on the phone and the desktop strip (2026-10-22). Still to check: on
  a phone without it, the text box, the suggestion chips and "Add to the queue"
  should be dead, and a tapped chip should queue like a typed line.
- **Go sends a real turn.** Go from a phone reached the desktop with no key
  (2026-10-22). Still to check, with a key: the desktop log (Debug Logs →
  context) should show the turn as `> Name: line` lines, one per queued line,
  and the strip and every phone should show "The GM is working…" until the
  turn ends; and Go from the desktop strip should do the same. Needs a key, so
  it waits for the author's go.
- **A roll and a question go to the right phone.** Set the adventure to
  manual dice, have the GM ask player A for a roll and put a question to
  player B, by name. Each prompt should appear only on that player's phone; the
  desktop strip should say it is waiting, with "Answer here". A's answer
  ("17", or "Roll for me") and B's picks should reach the GM, and the turn
  should continue. Also tap "Answer here" on the desktop and confirm the phone's
  prompt disappears. Needs a key.
- **The GM writes each player a sheet.** Join a phone to a story that began
  solo. After a turn or two the GM should create `Character: <name>` and the
  phone's "Character" section should fill in. If it doesn't, the "Party
  Table" note (Menu → Notes, GM instructions) isn't reaching the GM. Needs a
  key.
- **A phone sleeps and wakes.** Lock a phone for a minute, unlock it: it should
  show "Reconnecting…" and then its own seat again, with its queue and sheet,
  without the join form. Then close the table and open it again: the phone
  should say it can't reach the table, and after rescanning show the join form
  with the open seat.
- **A secret never reaches a phone.** Put a `secret` note, a `gm_plan` note and
  a `hidden` note in a story and join a phone. In the phone browser's dev tools
  (Network → WS → Messages, or `chrome://inspect` on Android) read every
  message: none of those notes' text should appear. The redaction test proves
  the builder; this proves nothing else sends around it.
- **A guest Wi-Fi.** Put the phone on a guest network with client isolation:
  the page should simply fail to load, and the lobby's help names that case.
- **The table closes with the story, and with a reload.** Open the table, go
  to the library, and confirm the phone says it can't reach the table and that
  `netstat -ano | findstr 8787` shows nothing listening. Then open it again and
  reload the app window (Ctrl+R): the same should hold, and the Menu should show
  the table as closed. *Failure looks like:* a listener still on the port after
  a reload (the `on_page_load` hook in `src-tauri/src/lib.rs`).
- **Removing a player mid-prompt.** In manual dice mode, have the GM ask a
  player on a phone for a roll, then remove that player from the strip. The
  roll prompt should open on the desktop, and answering it should continue the
  turn. The removed phone should say "You were removed from the table" and
  offer "Join again" without reconnecting by itself. Needs a key.
- **Not built yet (PR P2):** the Android app's scanner and "Open in app",
  voice from a phone, and the native WebSocket. A phone cannot speak a line in
  PR P1; the transcription path is wired and tested but has no client.

## 2026-10-21 — Claude on the subscription (Route B of the Claude GM plan)

The author gave the go on 2026-10-21 and the checks were run in the built
desktop app: a played GM turn with rolls, Stop, the Designer, the choices
stage in stream mode, the cost label, side agents staying off the
subscription, and online play blocking it. The results, with numbers, are in
`claude-gm-implementation-plan.md` → "First live run". What is left:

- **Re-check the first-round fix on the subscription (needs the author's
  go: it draws on the plan).** Built but not yet tried live: the answer
  protocol now says the tools are run for the model and shows an example call,
  the Debug Logs gain a "Claude CLI run" line per run, and a first round that
  makes no call *and* claims its tools are down is retried once with a call
  required. Start five or so new stories on "Claude Sonnet (subscription)",
  give each a clear opening message ("gritty fantasy, start with a goblin
  ambush"), and note whether the very first turn comes back with a character
  sheet, mechanics and plan notes and a `start_game`. Before the fix it did
  not about half the time (1 of 2). In Settings → Debug Logs, each run has a
  "Claude CLI run" entry (model, effort, round, wall and model time, the tool
  calls that came back, `subtype`); a fired guard shows as "the first round of
  a fresh conversation claimed its tools were unavailable … retrying once",
  and its second run is the entry with `firstRoundRetry: true` (`round` also
  reads 1 after a gate's re-prompt, so use that flag, not `round`, to find a
  retry).
  *Failure looks like:* a first turn with no calls and no retry line (the
  model worded the claim in a way the detector does not know, or made no claim
  at all, so the guard stayed out of the way: tell the author the wording);
  the retry line followed by a second miss (the CLI is not honouring
  `minItems`); a gratuitous `formula_roll` for "Strike the goblin" in the
  first turn of a story that gave no fight (the protocol's example was copied
  too literally).
- **The story stage on the subscription.** The GM wrote its own prose in every
  turn so far, so the separate story stage (the one that cuts the text at the
  `[STOP]` markers) never ran. Stream mode itself is confirmed (the choices
  stage ran in it). To see the story stage: a turn where the GM's last round
  is only tool calls. *Failure looks like:* the text arriving all at once, or
  `[GAME MASTER State Update]` text left in the prose.
- **Stop with an npm-installed CLI.** Confirmed with the native `claude.exe`
  (gone within about a second). With `claude.cmd` from an npm install, Task
  Manager should show no `node.exe` running `claude` after Stop either.
- **Synced settings on the phone or the web build.** Sync from the desktop
  with a subscription tier set, then open Settings → AI Config on another
  device. A "Claude subscription" box should list the tier and say which
  default it uses there, and a turn should run on that default. (The web
  build's box was checked in the preview with the keys set by hand; a real
  sync was not.)
- **Couch co-op with the subscription.** Solo play was used for every
  subscription turn above. Two or more players on one device should run on
  the subscription as well, and so should party mode once it is on master
  (decision 30).
- **macOS and Linux.** Only Windows was built and run; the environment list
  for the child differs there (`claude_cli.rs`, `PASSED_ENV`).

## 2026-10-21 — GLM through Z.ai and OpenRouter (PR C of the Claude GM plan)

Request shaping is unit-tested (`tests/providerCall.zai.test.ts`); no
request has reached Z.ai. A played turn spends the author's Z.ai credit, so
it waits for the author's go.

- **One played turn on "GLM 5.3 (Z.ai)".** Save a Z.ai API key (Settings →
  API Keys, "Z.ai API key (pay-as-you-go, not the Coding Plan)"), set tier 1
  to "GLM 5.3 (Z.ai)" and play a turn in a combat scene so the GM rolls. The
  GM should call `formula_roll`, then narrate; the Debug Logs should show
  "AI generation (stream) complete" lines with `provider: "zai"` and no
  error. Do it once in the desktop app too (`tauri build`), which can reach
  only `https://api.z.ai/api/paas/*`. *Failure looks like:* a 400 naming
  `thinking`, `reasoning_effort` or `tool_choice` (Z.ai changed what GLM-5.3
  accepts); "url not allowed on the configured scope" in the desktop app
  (the allowlist); a 401 or "insufficient balance" with a key that only has
  a GLM Coding Plan behind it - expected, because the plan does not cover
  the general API. Tier 1 runs at effort `none`, which adds the GM's
  `<thinking>` prefill; it is dropped from round 2 on, so `<thinking>` text
  in the prose or a 400 on round 2 would mean it was not.
- **The roll gate on Z.ai.** In the same scene, a turn where the GM first
  narrates without rolling: the gate's re-prompt should get a roll on the
  next round. Z.ai accepts only `tool_choice: "auto"`, so the forcing rests
  on the re-prompt alone. *Failure looks like:* the gate firing twice, then
  prose without a roll.
- **"GLM 5.3 Flash (Z.ai)" as the narration voice.** One turn where the GM
  rolls, so the story stage runs on Flash. *Failure looks like:* "model not
  found" (the id `glm-5.3-flash` is wrong) or a 400 about `stop` (Z.ai takes
  one stop word, and the app sends one).
- **Z.ai's content moderation.** Z.ai's direct API moderates content (error
  code 1301), so a violent or mature scene can fail a turn there that
  OpenRouter's other hosts would answer. Worth knowing before choosing it
  for a dark campaign; not something the app can change.
- **GLM 5.3 through OpenRouter.** With only an OpenRouter key, one turn on
  "GLM 5.3 Flash". Compare the turn cost panel with openrouter.ai/activity:
  the catalog prices it at Z.ai's own $0.15 / $0.50, but OpenRouter may
  route to a cheaper or dearer provider.

## 2026-10-21 — Claude through OpenRouter (Route A of the Claude GM plan)

Request shaping is unit-tested (`tests/providerCall.anthropic.test.ts`), but
no request has reached Claude: a played turn spends the author's OpenRouter
credit, so it waits for the author's go (`claude-gm-implementation-plan.md`
§5).

- **One played turn on Claude Sonnet 5.5.** With an OpenRouter key saved,
  set the tier-1 slot (Settings → AI Config) to "Claude Sonnet 5.5", leave
  its effort at `none`, and play a turn that needs a roll (an attack in a
  combat scene). The GM should call `formula_roll`, then narrate. Then open
  Settings → Debug Logs and read the "AI generation (stream) complete"
  lines: round 1 should show `cacheWriteTokens` in the thousands, round 2
  `cachedTokens` about the same size. *Failure looks like:* a 400 naming
  `budget_tokens` or `thinking` (OpenRouter turning `reasoning.effort` into a
  thinking budget for this model: the effort branch in `applyReasoningEffort`
  needs another shape); a 400 about a thinking block or edited history in
  round 2 (the replay rule in `buildRequestMessages` keeps a block Claude
  will not take); `cachedTokens` 0 in round 2 (the breakpoint is not
  reaching Anthropic, or the prefix before it changed between rounds).
- **The turn's cost matches OpenRouter's bill.** For Claude the ledger takes
  OpenRouter's own `usage.cost`, which prices the cache. The turn cost
  panel's figure for that turn should match openrouter.ai/activity to the
  cent, and round 2 should cost a fraction of round 1. *Failure looks like:*
  round 2 billed about the same as round 1 (no `cost` in the usage, so the
  list-price fallback ran). The "Cost per turn" *estimate* above the tiers
  still uses list prices and will read high for Claude; that is known.
- **Escalating into a Claude tier mid-turn.** Put Claude Opus 5.5 on tier 3
  only, keep Mistral on the others, and play a turn where the GM calls
  `set_reasoning_tier` to go up. The round after the switch continues a tool
  loop another model started, with no thinking block (or Sonnet's, on a
  Sonnet→Opus switch). The turn should carry on. *Failure looks like:* the
  turn fails with an OpenRouter error about thinking blocks; a stream error
  has no tier fallback, so the whole turn errors out.
- **Narration on Claude after a tool round.** Set the narration voice to a
  Claude model, play a turn where the GM rolls, then retry that turn. The
  story stage sends the GM's tool calls and results without a `tools`
  list. *Failure looks like:* a 400 about `tool_use` blocks without tools
  (Anthropic has rejected that before; whether OpenRouter papers over it is
  unknown).
- **The Game Designer on Claude.** Point the Designer at Claude Sonnet 5.5
  (Settings → Architecture) and ask for something that makes it write a
  note. Its draft-state system message comes after the history and changes
  every round. *Failure looks like:* the second round of a tool loop failing
  with an error about thinking blocks or edited history.
- **A side agent on Claude.** Point the Memory Keeper and the Observer at
  Claude Haiku 5.5 and play two turns. Memories should be written and the
  Observer's verdicts should appear in the Debug Logs. Their 200–300 token
  caps are raised to 4,096 for Claude, because thinking counts against the
  cap. *Failure looks like:* no memories and no warnings, which means the
  output was used up by thinking.

## 2026-10-21 — side agents on the narration model (PR #204, decision 19)

A played turn needs the author's keys, so it waits for their go.

*Superseded in part by decision 51 (2026-10-21):* an unpinned side agent no
longer follows the narration model, it runs on Claude Haiku 5.5. Mistral then
retired Small 3.2 (`mistral-small-2506`), so a pin on it now runs on Mistral
Small 4 (`mistral-small-2603`; `LEGACY_MODEL_KEY_ALIASES`). Read
"Mistral Small 3.2" in the checks below as "the model the layer is pinned to":
pin the layers (Settings → Architecture) to a Mistral model to run them. The
failure they guard against, a side call naming `mistral-small-2506` and
falling back to DeepSeek V4 Flash, is still the thing to look for, and the
new default is checked under the catalog refresh above.

- **Side agents with only a Mistral key.** Save only a Mistral key, leave
  every Settings → Architecture override off, and play a few turns. The
  Debug Logs should show the Observer's judges, the Memory Keeper and (every
  10th turn) the Story Progress Observer calling **Mistral Small 3.2**, the
  Memory tab should gain entries, and there should be no "Side call failed"
  warnings. *Failure looks like:* `Model key "mistral-small-2506" not found,
  falling back to DeepSeek V4 Flash` in the console, then `NO_API_KEY` side
  call failures (the pre-#204 behaviour). Without #204 the PR #191 side-call
  check below fails the same way.
- **Mistral Small 3.2 as Observer judge.** For players without a DeepSeek
  key the Observer now runs, and can rewrite or reset a turn, for the first
  time. Over a dozen turns, note whether its flags (Debug Logs, "observer")
  look sensible or fire on clean turns. Too many false flags means pinning
  the Observer to a stronger model, or a different default.

## 2026-10-21 — Stop cancels the provider call in the native apps

The unit tests (`tests/providerFetch.abort.test.ts`) mock the platform fetch;
these need a live key, so they wait for the author's go.

- **Stop mid-turn in the desktop app.** With a key saved, start a turn on a
  model that thinks visibly and press Stop while the GM's reasoning is still
  streaming. The stream should stop within a second, no further GM round or
  story stage should start, and the scene should revert to before the turn.
  On OpenRouter, the Activity page should show that generation cut short
  (far fewer output tokens than a finished turn). Expect a failure toast
  reading "Error: signal is aborted without reason", possibly twice. The web
  build shows the same toast on Stop, so it is not part of this fix; before
  the fix, the desktop app showed "Generation cancelled by user" once the
  round had run out. *Failure looks like:* the
  reasoning keeps streaming after Stop and the turn runs to its end (the
  signal is not reaching Tauri's fetch), or a "Request cancelled" error
  instead of the ordinary cancellation (the AbortError normalisation in
  `providerCall.ts`).
- **Stop mid-turn on Android or iOS**, once a mobile build exists. The UI
  should stop at once, as on the desktop. The provider request itself runs to
  completion and is billed in full: Capacitor's patched `fetch` ignores the
  abort signal, so this is expected, not a failure.

## 2026-10-21 — the native fixes merged after the health check

None of these could run here: they need the author's own API keys (spending
real money), a second person or device, an Android SDK, or a Mac.

- **OpenRouter sign-in in the desktop app (PR #201).** Install the build from
  `npx tauri build`, open Settings → API keys, choose "connect with
  OpenRouter". The system browser should open on openrouter.ai; after
  signing in it shows a code. Paste it into the app's field: the OpenRouter
  key should appear as saved, and a turn should then reach OpenRouter.
  *Failure looks like:* nothing opens (the opener plugin or its `https://*`
  scope in `src-tauri/capabilities/default.json`), or "OpenRouter rejected
  that code" right after a fresh code (the PKCE verifier was not kept).
- **AI side calls in the desktop app with a live key (PR #191).** With only a
  Mistral key saved, play a story long enough to pass the compaction point.
  The Debug Logs should show the Observer and Memory Keeper running, a scene
  summary should appear, and no "Side call failed" warnings. *Failure looks
  like:* a `SyntaxError: Unexpected token '<'` (a call still hitting
  `/api/*`, which Tauri answers with `index.html`).
- **The Game Designer in the desktop app (PR #191).** With a key saved, open
  the creator and send one message. The Designer should reply, and its tool
  calls should edit the draft.
- **TTS and sync in the desktop app (PR #191 added the allowlist hosts).**
  Play a line through Cartesia or ElevenLabs; push and pull through Settings
  → Sync. *Failure looks like:* `url not allowed on the configured scope`
  in the console — a host missing from `src-tauri/capabilities/default.json`.
  A custom sync domain needs its own entry there.
- **The text invite between two devices (PR #198).** Host an online game in
  the desktop app and "Copy invite link": the clipboard should hold a
  sentence with the room code and connection type, not a
  `tauri.localhost` URL. A second device should join with that code
  through "Join a Game".
- **Android and iOS builds.** Never built. `build-apps.yml` (manual
  `workflow_dispatch`) builds an unsigned debug APK and an iOS simulator
  build; triggering it uses the author's Actions minutes, so it waits for
  the author's go. PR #201 changed `android/` and `ios/` project files for
  `@capacitor/browser`.
- **macOS and Linux desktop builds.** Only Windows has been built. On macOS
  and Linux the app origin is `tauri://localhost`, not `http://tauri.localhost`.
