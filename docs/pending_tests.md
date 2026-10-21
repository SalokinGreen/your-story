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
