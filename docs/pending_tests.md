# Pending tests

Checks a session could not perform itself, written as checks a person
performs, with the expected result and — where predictable — what the
failure looks like. Newest at the top, one dated heading per session.

**This file is for work that was impossible, never for work that was merely
extra effort.** A session on the author's machine that can run a check runs
it. A session that confirms an entry deletes it; entries only leave this
file by being tested, not by ageing out. See `CLAUDE.md` → "What a cloud
session cannot do".

## 2026-10-21 — side agents on the narration model (PR #204, decision 10)

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
