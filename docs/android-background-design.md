# Android: turns that survive leaving the app, and the back gesture — design

Status: **draft, waiting for the author's approval.** The implementation plan
is [`android-background-plan.md`](android-background-plan.md). Decisions
132–135 in [`decisions.md`](decisions.md).

## 1. Why

The author, playing on the phone: "I want to be able to leave the app while it
generates and it finishing generating instead of breaking. And when I use the
back gesture I want it to work in the app instead of closing the app."

What the code does today (traced 2026-10-23):

- **Nothing keeps a turn alive.** The Android shell is a bare `BridgeActivity`
  with only the INTERNET and microphone permissions: no foreground service,
  no wake lock, no lifecycle handling. Capacitor does not pause the WebView's
  JavaScript when the app leaves the screen (`Bridge.shouldKeepRunning()`
  defaults to true), so what most likely breaks a turn is Android
  restricting or killing a background app that holds no foreground service,
  plus Doze cutting its network. The story is saved only when a turn
  finishes, so a killed turn reloads as if it never happened, and the
  player's line is lost with it.
- **The back gesture closes the app.** `@capacitor/app`, the plugin that
  delivers Android's back button to the page, is not installed, so every
  back gesture falls through to the activity and closes it.
- **Streaming doesn't stream on the phone.** `capacitor.config.ts` enables
  `CapacitorHttp`, which replaces `window.fetch`. Every POST goes to native
  HTTP, which reads the whole body before handing it back (the Capacitor
  source shows a `readStreamAsString` and no streaming path). So the GM's
  reply arrives in one burst at the end. The `AbortSignal` is never passed to
  native either, so Stop clears the screen while the request runs on to the
  end and is billed.

## 2. What the player sees afterwards

- **Send a turn, then leave the app.** A notification appears: "Your Story is
  writing your turn…". The turn finishes in the background. If the player is
  still away, the notification becomes "Your turn is ready" (tap to open). If
  they come back first, it just goes away (decision 132).
- **The first turn on Android 13+** asks once for permission to show
  notifications. If the player says no, the turn still survives the
  background; only the notifications stay hidden.
- **The back gesture steps back inside the app** (decision 133). It closes
  the top thing that is open: a dialog or modal, the full-screen picture, the
  story menu sheet, then a story sub-page (Notes, NPCs, Goals, AI Context,
  Logs). On the story itself it goes to the Library. On a Library sub-view it
  goes to the Library home, and from the Designer it goes to the Library. On
  the Library home (or the start page) it puts the app in the background,
  like Home: the app is never killed, and coming back finds it as it was.
- **The GM's reply streams word by word on the phone, and Stop cancels the
  request** (decision 134). This applies to OpenRouter, Mistral, DeepInfra and
  DeepSeek, which covers every default model. Google AI Studio and Z.ai keep
  today's path (§3.3).
- **If Android kills the app anyway** (low memory, swiped from recents), the
  story reopens with the player's line kept and a note: "The last turn was
  interrupted." A Retry button sends that line again (decision 135). Dismiss
  clears it.
- Nothing changes on the web build or the desktop app, except that the
  interrupted-turn note works there too (a crash or a closed tab mid-turn).

## 3. How

### 3.1 Keeping a turn alive: a foreground service of our own

A small Capacitor plugin inside the Android project (not an npm dependency):

- `TurnKeepAliveService`, an Android `Service` started in the foreground with
  type `dataSync` and an ongoing notification. Android 14+ requires a type,
  and `dataSync` is the one whose stated use (upload/download) fits a network
  job the player started. Android 15+ caps `dataSync` at 6 hours per 24 hours
  and calls `onTimeout`, where the service stops itself. That is far above
  any turn.
- `TurnKeepAlivePlugin`, with `begin({ title })`, `end()` and
  `notifyReady({ title, body })`. Registered in `MainActivity`.
- The manifest gains `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC` and
  `POST_NOTIFICATIONS`, plus the `<service>` declaration with
  `android:foregroundServiceType="dataSync"`.
- JS side: `app/misc/turnKeepAlive.ts`, a no-op everywhere but Android, with
  `beginTurnKeepAlive()` and `endTurnKeepAlive({ ready })`. The page calls
  `begin` when a turn starts. Android only allows a foreground service to
  start while the app is visible, and the player has just tapped Send, so it
  is. It calls `end` when the turn finishes, fails or is stopped. On a
  finished turn with `document.visibilityState === "hidden"`, `end` posts the
  "ready" notification. Calls nest (a counter), so a retry inside a turn
  doesn't stop the service early.

Why our own plugin rather than a third-party one: the repository is public
and the native surface is small (two classes). We also control the
notification text and the `dataSync` type, which the third-party plugin's
documentation does not confirm.

Play Store: a `dataSync` foreground service must be declared in Play Console
with a video. The app is not on the Play Store yet (the APK is installed by
hand), so this is noted for when it is, not done.

### 3.2 The interrupted turn

`app/misc/interruptedTurn.ts` keeps one record per story in localStorage
(device-only, never synced, because another device has no turn in flight):
`{ storyId, text, startedAt }`.

- It is written when a turn starts, holding the player's line (the text the
  page already builds for the GM).
- It is cleared when the turn finishes, fails, or is stopped by the player.

On story load, a record means the last turn never finished. The story then
shows a slim banner above the composer: "The last turn was interrupted.
Retry · Dismiss".
- **Retry** sends the same line through the normal custom-input path.
- **Dismiss** clears the record.

A record older than 24 hours is dropped silently.

The undo snapshot taken at turn start (`persistUndoStack`) already restores
the pre-turn story, so nothing else needs saving mid-turn.

### 3.3 Streaming and Stop on Android

`platformFetch.ts` gains `getStreamingProviderFetch(url)`. On Capacitor it
returns the WebView's own fetch (`window.CapacitorWebFetch`, which Capacitor
keeps when it patches `window.fetch`), but only for a host on the
CORS-capable list. Otherwise it returns `getProviderFetch()` as today. That
fetch streams, and it honours `AbortSignal`. `providerCall.ts` uses it for
streamed requests only. Non-streamed calls stay on native HTTP, which avoids
CORS entirely.

The list comes from a CORS preflight sent 2026-10-23 as the app's origin,
`https://localhost` (Capacitor's default Android origin):

| host | preflight | on the list |
|---|---|---|
| openrouter.ai | 204, allows `*`, Authorization, HTTP-Referer, X-Title | yes |
| api.mistral.ai | 200, allows `*`, Authorization, Content-Type | yes (it is sent no Referer or Title) |
| api.deepinfra.com | 200, allows `*` and the four headers | yes |
| api.deepseek.com | 200, reflects `https://localhost` | yes |
| generativelanguage.googleapis.com | 403 | no |
| api.z.ai | 200, but no `Access-Control-Allow-*` headers | no |

A host that later drops CORS would fail with a network error. So a streamed
request that fails before any byte arrives, with a `TypeError` (how a CORS
refusal surfaces), retries once on the native path, and the host is marked
off the list for the session. That keeps a provider change from breaking
turns.

### 3.4 The back gesture

- Add `@capacitor/app` (the official plugin). One listener, registered once
  in the root layout and only on Android, receives every back gesture.
  Registering it switches off the default close.
- `app/misc/backStack.ts` holds a LIFO stack of close handlers.
  `useBackHandler(open, onBack)` pushes one while `open` is true and removes
  it when it closes. Every modal, sheet and overlay that already closes on
  Escape or a close button registers this way, with the same function it
  calls on Escape.
- The listener pops the top handler and calls it. With an empty stack it
  asks the route: the story page's own back (a sub-page → the story; the
  story → `/library`), the Library's (`goHome()`, then background), the
  Designer's (→ `/library`). The fallback is `App.minimizeApp()`.
- Escape on the web and the desktop is unchanged. This only adds a native
  path that calls the same close functions.

## 4. What stays the same, and what is out of scope

- The web build and the desktop app keep their current fetch paths. Only the
  interrupted-turn note is new there.
- **iOS** gets nothing here: it allows a backgrounded app about 30 seconds,
  which is not enough for a turn. That needs its own design (a background
  URLSession), noted as follow-up.
- Side agents that run after a turn's text is shown (the Memory Keeper,
  reflection, background Observer work) are inside the kept-alive window
  only as far as the turn awaits them. The keep-alive ends when the turn's
  promise settles.
- Party mode and online play are unchanged.

## 5. Risks

- **What only a device can settle:** whether the WebView's network keeps
  going behind a foreground service with the screen off, and in Doze. The
  service exempts the app from App Standby, and Android documents no Doze
  exemption for it. A long turn left with the screen off on a quiet phone is
  the real test. It goes in `pending_tests.md`, and the CI builds the APK.
- **CORS lists drift.** The fallback in §3.3 covers that.
- **Streaming through the WebView** may behave differently on old WebView
  versions. `minSdk` is 24 and the WebView updates through Play, so it is
  noted.
- **The notification permission prompt** appears in the middle of the first
  Send. Accepted: Android requires the prompt before a notification can show,
  and asking at the moment it is needed is the platform's own advice.
