# Pending tests

Checks a session could not perform itself, written as checks a person
performs, with the expected result and — where predictable — what the
failure looks like. Newest at the top, one dated heading per session.

**This file is for work that was impossible, never for work that was merely
extra effort.** A session on the author's machine that can run a check runs
it. A session that confirms an entry deletes it; entries only leave this
file by being tested, not by ageing out. See `CLAUDE.md` → "What a cloud
session cannot do".

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
