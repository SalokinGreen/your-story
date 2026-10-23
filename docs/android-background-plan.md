# Android: turns that survive leaving the app, and the back gesture — implementation plan

Status: **draft, waiting for the author's approval.** Design:
[`android-background-design.md`](android-background-design.md). Decisions
132–135. Branch `claude/android-background`, one PR, five slices. Line
numbers are from `master` at e1000b1 (2026-10-23).

**Every slice ends with `tsc` clean and the suite green.** None of this can
run on this machine's phone-less setup, so every slice that touches
`android/` is checked by a CI build (`build-apps.yml`, which now signs with
the shared key, #229). The author installs the APK and works the
`pending_tests.md` list. Baseline: Vitest 172 files / 2,537 tests, `tsc`
clean, lint counted per touched file.

## Slice 1 — The keep-alive service (decisions 132)

**Native, `android/app/src/main/`**
- `java/com/yourstory/app/TurnKeepAliveService.java`: a `Service` that
  creates its notification channel `turn` ("Turns in progress", low
  importance, no sound). In `onStartCommand` it calls
  `startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)`
  (the three-argument form on API 29+, the two-argument form below), with
  title "Your Story is writing your turn…", ongoing, and a tap that opens
  `MainActivity`. `onTimeout(int, int)` (API 35) calls `stopSelf()`.
  `START_NOT_STICKY`.
- `java/com/yourstory/app/TurnKeepAlivePlugin.java`: `@CapacitorPlugin(name =
  "TurnKeepAlive")` with three methods.
  - `begin(title?)`: requests `POST_NOTIFICATIONS` the first time on API
    33+, through the plugin's permission alias, then starts the service with
    `ContextCompat.startForegroundService`.
  - `end()`: stops the service.
  - `notifyReady(title, body)`: posts notification 2 on a `ready` channel
    (default importance), auto-cancel, tap opens the app. It does nothing
    without the permission.
- `MainActivity.java`: `registerPlugin(TurnKeepAlivePlugin.class)` before
  `super.onCreate`.
- `AndroidManifest.xml`: the `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_DATA_SYNC` and `POST_NOTIFICATIONS` permissions, and
  `<service android:name=".TurnKeepAliveService" android:exported="false"
  android:foregroundServiceType="dataSync" />`.

**JS, `app/misc/turnKeepAlive.ts`**
- `registerPlugin<TurnKeepAlivePlugin>("TurnKeepAlive")` from
  `@capacitor/core`.
- `beginTurnKeepAlive(): void` and `endTurnKeepAlive(opts: { ready: boolean }): void`.
  - Both are a nesting counter.
  - Both are no-ops unless `Capacitor.getPlatform() === "android"`.
  - Native calls are fire-and-forget, with errors logged to the Debug Logs
    and never thrown into the turn.
  - `end` with `ready && document.visibilityState === "hidden"` calls
    `notifyReady("Your turn is ready", <story name>)` before ending.

**`app/story/page.tsx`**: `generateTrackedTurn` (`574`) calls
`beginTurnKeepAlive()` before `generateStoryTurn` and, in `finally`,
`endTurnKeepAlive({ ready: <the turn produced a part> })`. Every turn path
(`2354`, `2950`, `3954`) goes through it, so Stop and errors end it too.

**Tests.** `tests/turnKeepAlive.test.ts` mocks `@capacitor/core`:
- a no-op on web and on iOS;
- the begin/end nesting, with one native begin and one native end;
- the ready ping only when hidden and `ready`;
- a native error never throws.

## Slice 2 — The interrupted turn (decision 135)

**`app/misc/interruptedTurn.ts`** (pure plus localStorage behind try/catch):
- `markTurnStarted(storyId, text)`, `clearTurn(storyId)`;
- `readInterruptedTurn(storyId, now): { text; startedAt } | null`, which
  drops and returns null past 24 h;
- key `ys:interruptedTurn:<storyId>`, not on the sync allowlist.

**`app/story/page.tsx`**:
- `markTurnStarted` where a turn's player text is final, before
  `generateTrackedTurn`. That is the same text `handleCustomInput` and
  `handleChoice` push as the player's part.
- `clearTurn` in `generateTrackedTurn`'s `finally`, and in `handleStop`.
  (Only a killed process leaves the record.)
- On load (`setupUIFromStory`), `readInterruptedTurn` feeds an
  `interruptedTurn` state.

**`app/story/story.tsx`**: a banner above the composer on the `ys-*`
tokens: "The last turn was interrupted." with Retry (calls `onCustomInput`
with the text) and Dismiss (clears). New `StoryProps`:
`interruptedTurnText?: string`, `onRetryInterrupted?`,
`onDismissInterrupted?`.

**Tests.** `tests/interruptedTurn.test.ts`:
- mark → read → clear;
- expiry at 24 h;
- per-story keys;
- localStorage throwing.

**Check.** In the browser preview, start a turn with no key, so it fails
fast and clears: no banner. Then write a record by hand and reload: the
banner shows, Dismiss clears it, and Retry sends the line. Take a
screenshot.

## Slice 3 — Streaming and Stop on Android (decision 134)

**`app/misc/platformFetch.ts`**:
- `STREAMING_CORS_HOSTS = ["openrouter.ai", "api.mistral.ai", "api.deepinfra.com", "api.deepseek.com"]`,
  with the preflight evidence from design §3.3 in its comment;
- `getStreamingProviderFetch(url: string): typeof fetch`:
  - Tauri: unchanged;
  - Capacitor native, with the host on the list and not marked down for the
    session, and `window.CapacitorWebFetch` present: return it;
  - else `getProviderFetch()`;
- `markStreamingHostDown(host)`.

**`app/misc/providerCall.ts`**:
- `generateStream`'s request (`postChatRequest`, `650`) takes the fetch from
  `getStreamingProviderFetch(url)`.
- On a `TypeError` before the response, when that fetch was the WebView one,
  call `markStreamingHostDown(host)` and retry once with
  `getProviderFetch()`.
- `generateNonStreaming` is unchanged.

**Tests.** `tests/platformFetch.streaming.test.ts`:
- host selection on web, on Capacitor and on Tauri;
- marked-down fallback;
- no `CapacitorWebFetch` means the patched fetch.

`tests/providerCall.*`: a stream on the WebView fetch that throws
`TypeError` retries once on the native one and marks the host.

**Check.** The standalone build. The real proof is on the device (stream
visible word by word; Stop ends the request), so it goes in
`pending_tests.md`.

## Slice 4 — The back gesture (decision 133)

- `npm install @capacitor/app@^8`, then `npx cap sync android`. Check that
  `android/app/src/main/assets/capacitor.plugins.json` lists it, and that
  the diff outside it is the sync's own.
- **`app/misc/backStack.ts`**: `pushBackHandler(fn): () => void` (returns
  remove), `popBackHandler(): boolean`, plus a route fallback registry,
  `setRouteBack(fn | null)`.
- **`app/misc/useBackHandler.ts`**: `useBackHandler(active: boolean, onBack: () => void)`.
- **`app/components/NativeBackButton.tsx`**, mounted in `app/layout.tsx`:
  - only on Android;
  - `App.addListener("backButton", …)`;
  - `popBackHandler()`, otherwise the route fallback, otherwise
    `App.minimizeApp()`.
- **Registrations** use the function each one already calls on Escape:
  - the story page's modals (`ProfilePickerModal`, `OOCChatPanel`,
    `PartyLobbyModal`, `ManualRollModal`, `AskQuestionModal`,
    `DiceThrowModal`, `ConfirmDialog`, `SyncConflictModal`);
  - `StoryImage`'s full-screen view;
  - `StoryMenuSheet` and the Story Editor inside it;
  - the story sub-pages, where a `currentState !== STORY` route back sets
    `STORY`;
  - the story route back (→ `/library`);
  - the library (`goHome()` when not home);
  - the Designer (→ `/library`);
  - `APIKeysModal` and `LibraryPickerModal`.
- A modal that pauses the GM (manual roll, dice, ask-question) closes the
  way its own cancel does (null answer), so back works like "skip", not like
  a crash.

**Tests.** `tests/backStack.test.ts`:
- LIFO order;
- remove out of order;
- the route fallback;
- an empty stack returns false.

**Check.** The browser preview cannot fire a native back, so run the
dispatch through `popBackHandler` from the console against open sheets and
modals. Device checks go in `pending_tests.md`.

## Slice 5 — Docs and the APK

- `CLAUDE.md` "BYOK, no accounts, local storage, native shells": the
  keep-alive service, the streaming fetch rule and the back stack. Also: "a
  new modal registers `useBackHandler`".
- `docs/pending_tests.md` (2026-10-23, Android), each with an expected
  result and what failure looks like:
  - Send, press Home and wait: the turn finishes and the notification shows
    "ready".
  - The same with the screen off for 3 minutes.
  - Swipe the app away mid-turn: on reopening, the banner shows and Retry
    works.
  - Streaming is visible word by word on OpenRouter.
  - Stop mid-stream: OpenRouter's activity page shows the request cut short.
  - Back from each place in §2.
  - Back on the Library home backgrounds the app, and reopening keeps it.
  - On Android 13+, the notification prompt on the first Send.
- Run `build-apps.yml` (the author's go is this plan's approval) and send
  the APK.
- Both docs marked built.
- A devlog only if slice 2's banner is the one screen change, which it is.

## What breaks, and for whom

- Nobody's data. The new localStorage key is per device.
- A provider that drops CORS falls back once per session (design §3.3).
- The first Send on Android 13+ shows a permission prompt.

## Decisions made during implementation

(Filled in as slices land.)
