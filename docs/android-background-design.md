# Android: turns that survive leaving the app, and the back gesture — design

Status: **built (decision 136) on `claude/android-background`, 2026-10-23.**
Not yet checked on a phone: see `pending_tests.md`. The implementation plan
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
  Logs). On the story itself it goes to the Library, except while a turn
  is running, when it puts the app in the background instead: leaving the
  story mid-turn is what let a live turn look interrupted (engine review). On a Library sub-view it
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
- `TurnKeepAlivePlugin`, with `begin({ turnId })`, `end({ turnId })`,
  `notifyReady({ turnId, title, body })`, `notifyAttention({ title, body })`
  (added in testing, see below) and `requestNotificationPermission()`.
  Registered in `MainActivity`.
- The manifest gains `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC` and
  `POST_NOTIFICATIONS`, plus the `<service>` declaration with
  `android:foregroundServiceType="dataSync"`.
- JS side: `app/misc/turnKeepAlive.ts` is a no-op everywhere but Android.
  It exposes `beginTurnKeepAlive(turnId)` and
  `endTurnKeepAlive(turnId, outcome)`, outcome being `"ready"`, `"stopped"` or
  `"failed"`, plus `notifyPlayerNeeded(kind, detail)`.
  - **Begin** is called when a turn starts. Android only allows a foreground
    service to start while the app is visible, and the player has just
    tapped Send.
    - The service starts at once, and calls `startForeground` within
      Android's few-second limit.
    - The notification permission is **not** waited for: Android lets a
      foreground service run without it, and only the notification is
      hidden. The permission is asked separately, once, alongside.
  - **End** is called when the turn finishes, fails or is stopped.
  - Native calls are serialised and carry the turn's id, so an `end` that
    arrives before a slow `begin` finishes cannot leave a service running
    (Codex's review).
  - The "ready" notification is posted only for a turn that succeeded with
    non-empty prose, was saved, and was not stopped, while the app is in the
    background. The native side checks for that itself. A stale "ready" is
    cleared when the app comes back or the next turn starts.
- **A turn that pauses for the player** (a GM question, a manual roll, a
  dice throw) posts "The GM has a question for you" or "The GM needs a roll
  from you", only while the app is in the background, cleared on return. The
  author found the gap testing the first build: a paused turn fits neither
  "writing" nor "ready".
- The service declares `android:stopWithTask="true"` and stops in
  `onTaskRemoved`. Swiping the app away therefore ends the notification as
  well as the turn, and §3.2 picks up the pieces. Android 15's six hours is a
  total across 24 hours of background running, reset each time the app comes
  to the foreground, not an allowance per turn.

Why our own plugin rather than a third-party one: the repository is public
and the native surface is small (two classes). We also control the
notification text and the `dataSync` type, which the third-party plugin's
documentation does not confirm.

Play Store: a `dataSync` foreground service must be declared in Play Console
with a video. The app is not on the Play Store yet (the APK is installed by
hand), so this is noted for when it is, not done.

### 3.2 The interrupted turn

`app/misc/interruptedTurn.ts` keeps one record per story in localStorage.
It is device-only and never synced, because another device has no turn in
flight. The record is `{ storyId, turnId, mode, text, partsBefore, startedAt }`:
- `mode` is `"new"` for a player's line or choice, `"retry"` for a
  reroll or reword of the last turn.
- `partsBefore` is the number of scene parts before the turn began.

**Writing it.** The record is written at the one boundary every turn crosses,
the start of `generateTrackedTurn`. So the reroll, reword and
`intro_override` paths are covered as well as new input (Codex's review). It
holds the player's line as the page built it.

**Clearing it.** The record is cleared only once the turn's story is saved:
the final save is awaited, and a failed save keeps the record. It is also
cleared when the player stops the turn. A failed turn that the page already
reports with its own error and Retry clears it too.

**On story load.** A record means the last turn never finished.
- **Repair.** Nothing in the stored story is trusted past `partsBefore`. A
  debounced autosave can have written the player's line, or half a reply,
  before the kill. So the loaded story is cut back to `partsBefore` parts,
  the state the turn started from.
- **Banner.** A slim banner above the composer says "The last turn was
  interrupted." with Retry and Dismiss.
  - Retry sends the line again (`"new"`) or runs the page's own Retry of
    the last turn (`"retry"`).
  - Dismiss clears the record and keeps the repaired story.

A record older than 24 hours is dropped silently.

### 3.3 Streaming and Stop on Android

`platformFetch.ts` gains `getAbortableProviderFetch(url)`. On **Android**
it returns the WebView's own fetch (`window.CapacitorWebFetch`, which
Capacitor keeps when it patches `window.fetch`), but only for a host on the
CORS-capable list. Otherwise it returns `getProviderFetch()` as today.
- iOS keeps today's transport: its origin and CORS were not tested (Codex's
  review).
- The WebView fetch streams, and it honours `AbortSignal`.
- `providerCall.ts` uses it for **every** request to such a host, streamed
  or not, so Stop cancels the whole turn's calls on the default models. That
  includes the tier classifier, which now receives the turn's abort signal.
- The side agents that run after a turn's prose is shown keep their own
  lifetimes, as today.
- Google and Z.ai stay on native HTTP, which avoids CORS entirely and still
  cannot be cancelled.

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

A host that later drops CORS would fail with a network error, a
`TypeError`. Such a failure is **not** replayed automatically: the POST may
already have reached the provider and been billed (Codex's review).
Instead:
- the host is marked off the list for the session, so later requests use
  native HTTP;
- the turn fails with the page's ordinary error and its Retry, as any
  network failure does today;
- the player retries once, and that retry goes the native way.

### 3.4 The back gesture

- Add `@capacitor/app` (the official plugin). One listener, registered once
  in the root layout and only on Android, receives every back gesture.
  Registering it switches off the default close.
- `app/misc/backStack.ts` holds a LIFO stack of close handlers.
  `useBackHandler(open, onBack)` pushes one while `open` is true and removes
  it when it closes.
  - Each entry has a stable token and reads its callback through a ref, so a
    rerender neither reorders the stack nor stacks a second copy.
  - Every surface the player can dismiss registers this way, with the same
    function it calls on Escape or its close button.
  - The plan inventories them all: the Library's New Folder, Join, Host and
    Export dialogs, the menu's Save Copy and Compact, the nested note and NPC
    editors, the keys modal and the pickers. Shared primitives (the confirm
    dialog, the full-screen view) register once inside themselves, so
    callers get it for free.
  - A child surface registers on its own entry. Its parent's entry is below
    it, so one back closes only the child.
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
  the real test.
  - So slice 1 ends with an APK sent to the author **before** anything else
    claims to work. Slices 2–4 are built meanwhile because they do not
    depend on it.
  - If the turn does not survive, slice 1 is revisited (a partial wake lock,
    or moving the request into native code) before the PR is called done.
- **CORS lists drift.** The fallback in §3.3 covers that.
- **Streaming through the WebView** may behave differently on old WebView
  versions. `minSdk` is 24 and the WebView updates through Play, so it is
  noted.
- **The notification permission prompt** appears in the middle of the first
  Send. Accepted: Android requires the prompt before a notification can show,
  and asking at the moment it is needed is the platform's own advice.
