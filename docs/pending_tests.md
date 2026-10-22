# Pending tests

Checks a session could not perform itself, written as checks a person
performs, with the expected result and — where predictable — what the
failure looks like. Newest at the top, one dated heading per session.

**This file is for work that was impossible, never for work that was merely
extra effort.** A session on the author's machine that can run a check runs
it. A session that confirms an entry deletes it; entries only leave this
file by being tested, not by ageing out. See `CLAUDE.md` → "What a cloud
session cannot do".

## 2026-10-21 — Party mode (PR P1): the checks that need real phones

What was verified here: the Rust server's checks (`cargo test`, including a
real WebSocket relay on loopback), the whole TypeScript table
(`tests/party.*.test.ts`), the phone page in a browser against the real
runtime (two players, a steal and its cooldown ring, Go, a roll and a question
routed to the right player, a reconnect, nothing secret on the wire), and,
on the author's own phone and PC before the build, that a phone on this Wi-Fi
reaches a server on this PC (plan §7). What follows needs people, phones or a
live key. Run it from the built app: `RUSTUP_TOOLCHAIN=1.99.1 npx tauri build`,
then `src-tauri/target/release/app.exe`.

- **A real party from the installed app.** Menu → Party Mode → "Open the
  table". The lobby should show a QR code, a `http://192.168.x.x:8787/party?t=…`
  link and the network picker (on this PC the choices include a Tailscale
  address and a VPN-ish adapter; the default should be the wired
  `192.168.0.85`). Scan the QR with a phone on the same Wi-Fi: the join form
  appears. *Failure looks like:* a timeout on the phone (firewall, Public
  network or client isolation: see the lobby's help), or the phone page loading
  unstyled (a `/_next/static/...` path the bundle doesn't have: look at the
  failing request).
- **The Windows Firewall prompt on a fresh install.** The first "Open the
  table" from an installed copy should raise the prompt, once. The lobby's
  note says to allow Private networks only. The spike's rule was created for
  Private and Public together, so check which boxes the prompt really ticks.
  Decline it once and confirm the lobby's "A phone can't connect?" help covers
  it.
- **Two or more phones.** Join with two, a different colour each. Each phone
  should see both names. Take the spotlight on one, then on the other: the
  first should show the amber ring counting 15 s down, and a tap to take it
  back inside that time should be refused with a toast. Move the cooldown
  slider in the Menu and steal again: the next ring should follow it.
- **Lines need the spotlight.** On a phone without it, the text box, the
  suggestion chips and "Add to the queue" should be dead. With it, a typed line
  and a chip both appear in the queue on every phone and on the desktop strip.
- **Go from a phone, and Go from the desktop.** Either should send the queue as
  one turn; the desktop log (Debug Logs → context) should show it as
  `> Name: line` lines, one per queued line, and the strip and every phone
  should show "The GM is working…" until the turn ends. Needs a key, so it
  waits for the author's go.
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
