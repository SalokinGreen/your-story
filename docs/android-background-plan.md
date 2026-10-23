# Android: turns that survive leaving the app, and the back gesture — implementation plan

Status: **approved (decision 136), being built; revised after Codex's
review.** Design: [`android-background-design.md`](android-background-design.md).
Decisions 132–135. Branch `claude/android-background`, one PR, five slices.
Line numbers are from `master` at e1000b1 (2026-10-23).

**Every slice ends with `tsc` clean and the suite green.** Nothing native
can run here (no phone, no Android SDK), so a slice that touches `android/`
is checked by a CI build (`build-apps.yml`, which signs with the shared key
since #229) and by the author on the phone. **Slice 1's APK goes to the
author as soon as it builds**: the central promise (a turn survives the
background with the screen off) is unproven until then. Slices 2–4 do not
depend on it and are built meanwhile. Baseline: Vitest 172 files / 2,537
tests, `tsc` clean, lint counted per touched file.

## Slice 1 — The keep-alive service (decision 132)

**Native, `android/app/src/main/`**
- `java/com/yourstory/app/TurnKeepAliveService.java`, a `Service`:
  - Creates its channels on API 26+ (guarded): `turn` ("Turns in progress",
    low importance, no sound) and `ready` (default importance).
  - `onStartCommand` calls `startForeground` **immediately**. That is the
    three-argument form with `ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC`
    on API 29+, and the two-argument form below.
  - Its notification reads "Your Story is writing your turn…", is ongoing,
    and opens `MainActivity` when tapped.
  - `onTimeout(int, int)` (API 35+) and `onTaskRemoved` both call
    `stopSelf()`. It is `START_NOT_STICKY`.
  - It holds the current turn id. An `end` for another id is ignored, and an
    `end` that arrives before `begin` has been handled wins: a pending
    `begin` with that id is dropped. All three methods go through one
    handler on the main looper, so they are serialised.
- `java/com/yourstory/app/TurnKeepAlivePlugin.java`,
  `@CapacitorPlugin(name = "TurnKeepAlive", permissions = @Permission(alias = "notifications", strings = POST_NOTIFICATIONS))`:
  - `begin({ turnId })` starts the service with
    `ContextCompat.startForegroundService` **without** waiting for any
    permission.
  - `end({ turnId })`.
  - `notifyReady({ turnId, title, body })` posts on `ready` only if the app
    is not in the foreground (the plugin tracks `handleOnResume` and
    `handleOnPause`), the permission is granted, and the id matches the last
    `end`.
  - `requestNotificationPermission()` uses the alias on API 33+ and resolves
    at once below.
  - Resuming clears a posted "ready".
- `MainActivity.java`: `registerPlugin(TurnKeepAlivePlugin.class)` before
  `super.onCreate`.
- `AndroidManifest.xml`:
  - the `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC` and
    `POST_NOTIFICATIONS` permissions;
  - `<service android:name=".TurnKeepAliveService" android:exported="false" android:stopWithTask="true" android:foregroundServiceType="dataSync" />`.

**JS, `app/misc/turnKeepAlive.ts`**
- `registerPlugin<TurnKeepAlivePlugin>("TurnKeepAlive")`.
- `beginTurnKeepAlive(turnId: string): void`:
  - fires `begin`;
  - the first time on a device it also fires
    `requestNotificationPermission()`, remembered in localStorage and never
    awaited by the turn.
- `endTurnKeepAlive(turnId: string, outcome: "ready" | "stopped" | "failed"): void`
  fires `end`. On `"ready"` it fires `notifyReady` first.
- All calls are no-ops unless `Capacitor.getPlatform() === "android"`. They
  are fire-and-forget, errors go to the Debug Logs, and nothing throws into
  the turn.

**`app/story/page.tsx`**:
- `generateTrackedTurn` (`574`) gets a `turnId` (`crypto.randomUUID()` with
  the existing fallback).
- It calls `beginTurnKeepAlive(turnId)` before `generateStoryTurn`.
- It **awaits the turn's final save** before `endTurnKeepAlive`:
  - **The save becomes awaitable.** The success paths call
    `saveProgress(storyData, true)` unawaited (`3295`), and the legacy Retry
    uses the debounced save (`4260`). So `saveProgress` returns its promise,
    and the paths that end a turn hand that promise back to the wrapper.
  - **Ready** needs the turn to have succeeded, written a GM part with
    non-empty prose, saved, and not been aborted. The abort check is
    `generationAbortRef.current?.signal.aborted`.
  - Stop gives `"stopped"`, a thrown error or rejected save gives
    `"failed"`.

**Tests.** `tests/turnKeepAlive.test.ts` mocks `@capacitor/core`. It covers:
- a no-op on web and iOS;
- begin/end passing the turn id;
- `notifyReady` only on `"ready"`;
- the permission request once per device and never awaited;
- a native rejection never throws.

The native ordering rule (an early `end` beats a late `begin`) is Java, with
no test harness here. It is written as one small pure method,
`shouldStart(pendingId, endedId)`, and checked on the device.

**Check.** CI builds the APK, which is sent to the author with a short
script: Send → Home → wait; Send → screen off for 3 minutes; Send → Stop.
The expected results go in `pending_tests.md`.

## Slice 2 — The interrupted turn (decision 135)

**`app/misc/interruptedTurn.ts`** (pure, with localStorage behind
try/catch):
- `type InterruptedTurn = { storyId; turnId; mode: "new" | "retry"; text; partsBefore; startedAt }`.
- `markTurnStarted(rec)`, `clearTurn(storyId, turnId)` (it clears only that
  turn).
- `readInterruptedTurn(storyId, now)`, which drops and returns null past
  24 h.
- `repairInterruptedStory(story, rec): StoryData` cuts `scene.parts` back to
  `rec.partsBefore` and returns the story.
- Key `ys:interruptedTurn:<storyId>`, not on the sync allowlist.

**`app/story/page.tsx`**: marking happens inside `generateTrackedTurn`, the
one boundary. Its callers pass `{ mode, text }`.
- Custom input and choices (including the `intro_override` choices-only
  branch, `3443`) pass `"new"` and the player's line.
- Reroll (`runTurnGeneration`, `3802`) and reword (`3954`) pass `"retry"`.
- Reroll calls `runTurnGeneration` directly. So the wrapper either moves
  into `runTurnGeneration`, or `runTurnGeneration` calls the wrapper.
  Whichever: one place marks and clears.

`clearTurn`:
- runs after the awaited save in the wrapper;
- runs in `handleStop` (`3662`);
- runs on a failed turn the page already reports with its error and Retry;
- is kept when the save rejects.

On load (`setupUIFromStory`, after `ensureStoryDataArrays`), a record makes
the page run `repairInterruptedStory` and sets an `interruptedTurn` state.

**`app/story/story.tsx`**: a banner above the composer, on the `ys-*`
tokens, says "The last turn was interrupted." with Retry and Dismiss.
- Retry with `"new"` calls `onCustomInput(text)`; with `"retry"` it calls
  `onRetry`.
- Dismiss clears the record.
- New `StoryProps`: `interruptedTurn?: { mode; text }`,
  `onRetryInterrupted?`, `onDismissInterrupted?`.

**Tests.** `tests/interruptedTurn.test.ts` covers:
- mark, read, clear only the same turn id;
- expiry;
- per-story keys;
- localStorage throwing;
- `repairInterruptedStory` with a story that gained a player part and a
  half reply.

**Check.** In the browser preview, start a turn with no key: it fails fast,
and no banner appears afterwards. Write a record by hand with
`partsBefore = n` and two extra parts, then reload. The extra parts are
gone, the banner shows, Dismiss clears it, and Retry sends the line. Take a
screenshot for the devlog.

## Slice 3 — Streaming and Stop on Android (decision 134)

**`app/misc/platformFetch.ts`**:
- `CORS_HOSTS = ["openrouter.ai", "api.mistral.ai", "api.deepinfra.com", "api.deepseek.com"]`,
  with the design §3.3 preflight table in the comment.
- `getAbortableProviderFetch(url: string): typeof fetch`:
  - Tauri: unchanged;
  - **Android only** (`Capacitor.getPlatform() === "android"`), with the
    host on the list, not marked down this session, and
    `window.CapacitorWebFetch` present: return it;
  - otherwise `getProviderFetch()`;
  - iOS and the web are unchanged.
- `markHostDown(host)`.

**`app/misc/providerCall.ts`**:
- `postChatRequest` (`650`), the one place both paths post, takes its fetch
  from `getAbortableProviderFetch(url)`.
- On a `TypeError` thrown by the WebView fetch **before any response**, it
  calls `markHostDown(host)` and rethrows. It never replays, because the
  POST may have been billed.
- Reader errors after headers are untouched (today's behaviour).
- The Capacitor comment in `generateNonStreaming` (`1004`) is updated: on
  the listed hosts the fetch underneath now honours the signal.

**`app/misc/generation.ts`**: the tier classifier's `generateSimple` call
(`2116`) passes `options.abortSignal`.

**Tests.**
- `tests/platformFetch.abortable.test.ts`:
  - Android with a listed host → `CapacitorWebFetch`;
  - Android with an unlisted host → the patched fetch;
  - iOS and the web → unchanged;
  - a marked-down host → native;
  - no `CapacitorWebFetch` → native.
- `tests/providerCall.*`:
  - a WebView `TypeError` before any response marks the host and rethrows,
    with one fetch call (no replay);
  - an abort cancels the WebView fetch, both streamed and not.
- The classifier receives the signal.

**Check.** The standalone build. On the device, the stream shows word by
word, and Stop mid-stream ends the request (OpenRouter's activity page
shows it cut short). Both go in `pending_tests.md`.

## Slice 4 — The back gesture (decision 133)

- `npm install @capacitor/app@^8`, then `npx cap sync android`. Check that
  `capacitor.plugins.json` lists it, and that the rest of the diff is the
  sync's own.
- **`app/misc/backStack.ts`**:
  - `pushBackHandler(token: symbol, fn: () => void): void`,
    `removeBackHandler(token)`, `popBackHandler(): boolean`;
  - `setRouteBack(fn | null)`.
- **`app/misc/useBackHandler.ts`**: `useBackHandler(active, onBack)`.
  - A `useRef` token is pushed when `active` turns true and removed when it
    turns false or on unmount.
  - The callback is read through a ref, so a rerender neither reorders nor
    duplicates the entry.
- **`app/components/NativeBackButton.tsx`**, mounted in `app/layout.tsx`:
  - only on Android;
  - `App.addListener("backButton", …)` runs `popBackHandler()`, then the
    route back, then `App.minimizeApp()`.
- **Registrations.** First inventory every surface the player can dismiss:
  grep for `Escape` handlers, `fixed inset-0` overlays and `isOpen` /
  `onClose` props across `app/`. The list goes in the slice's "Decisions
  made" entry. At least:
  - **Shared primitives** (registered once, inside): `ConfirmDialog` and
    `FullScreenView` / the `StoryImage` full-screen view.
  - **The story page**: `ProfilePickerModal`, `OOCChatPanel`,
    `PartyLobbyModal`, `SyncConflictModal`, and `StoryMenuSheet` with the
    Story Editor inside it.
  - **The menu's** Save Copy, Compact Story and Export dialogs.
  - **The nested note and NPC editors.**
  - **`APIKeysModal`** (Settings), `LibraryPickerModal` and
    `GuidedStoryStart`.
  - **The Library's** New Folder, Join, Host and Export dialogs.
  - **The modals that pause the GM** (`ManualRollModal`, `DiceThrowModal`,
    `AskQuestionModal`) close through their own skip/cancel (a null
    answer).
- **Route backs**:
  - the story page: `currentState !== STORY` → `STORY`, else `/library`;
  - the Library: `goHome()` when not home, else none (falls to minimise);
  - the Designer: `/library`;
  - the privacy and terms pages: `router.back()`.

**Tests.** `tests/backStack.test.ts` covers:
- LIFO order;
- removing out of order;
- the same token pushed twice stays one entry;
- the route fallback;
- an empty stack returns false.

`tests/useBackHandler.test.tsx` (render with a toggled `active` and
rerenders): one entry, removed on close and on unmount, with the latest
callback called.

**Check.** The preview cannot fire a native back, so drive `popBackHandler`
from the console against an open sheet, a dialog inside it, and the
full-screen picture, and check the order. Device checks go in
`pending_tests.md`.

## Slice 5 — Docs and the APK

- **`CLAUDE.md`**, in the native-shells part:
  - the keep-alive service and its ordering rule;
  - the abortable fetch rule (Android only, the CORS list, no replay);
  - the back stack ("a new dismissible surface calls `useBackHandler`");
  - the interrupted-turn record.
- **`docs/pending_tests.md`** (2026-10-23, Android), each check with the
  expected result and what failure looks like:
  - Send → Home → wait;
  - screen off for 3 and for 10 minutes;
  - swipe away mid-turn → reopen: the repaired story and the banner;
    Retry works;
  - streaming visible word by word;
  - Stop mid-stream cancels on OpenRouter;
  - back from every place in design §2;
  - back on the Library home backgrounds the app, and reopening keeps it;
  - on Android 13+, the permission prompt on the first Send, and "deny"
    still finishing the turn;
  - on Android 14/15, the "ready" ping only when away.
- Run `build-apps.yml` (this plan's approval is the go) and send the APK.
- Mark both docs built.
- The devlog, with slice 2's banner and the back-stack console check.

## What breaks, and for whom

- Nobody's data: the new localStorage key is per device. Repair cuts only
  parts a dead turn left behind.
- On Android, a provider that drops CORS fails one turn with the ordinary
  error, and the player's Retry goes the native way.
- The first Send on Android 13+ shows a permission prompt.
- iOS and the web: no transport change.

## Codex's review (2026-10-23)

Codex (gpt-6.1-sol, high) found ten problems in the first draft. All were
checked against the code, and all are taken in:

1. The permission wait could start an orphan service. The service now
   starts at once, and calls carry turn ids.
2. The interrupted-turn record was cleared before an unawaited save, and
   the design wrongly said the undo snapshot restores the story. The save is
   now awaited, and the story is repaired to `partsBefore`.
3. Reroll, reword and the `intro_override` branch bypassed the marking.
   There is now one boundary with a `mode`.
4. The automatic fallback could double-bill. There is no replay: the host
   is marked down, and the player retries.
5. Stop missed non-streaming calls and the classifier. Every call to a
   listed host is now abortable, and the classifier gets the signal.
6. The streaming change touched iOS. It is now Android only.
7. Back coverage was incomplete, and rerenders could reorder entries. There
   is now an inventory, shared primitives register once, and entries use
   tokens and refs.
8. Swiping away could leave "writing…" up. The service now has
   `stopWithTask` and `onTaskRemoved`, and the six-hour cap is explained.
9. "Produced a part" was not readiness. Ready now needs saved, non-empty
   prose, no stop, and the app in the background.
10. Tests and order. The missing tests are added, and slice 1's APK goes to
    the author first.

## Decisions made during implementation

(Filled in as slices land.)

### 2026-10-23, slice 1 (the keep-alive service)

- **`end` is fired before `notifyReady`**, not after as the slice text says.
  The native side posts "ready" only for the id it last ended, so the order
  has to be end then ready; Capacitor runs a plugin's calls in order.
- **How the wrapper awaits the save.** `saveProgress` and `performSave` now
  return `Promise<boolean>` (true once written; false when it failed, there
  was no story id, or the write was only debounced). `performSave` already
  swallowed its errors into a toast, so a rejected save never happens; the
  boolean is how "saved" is known. The three `onComplete` handlers (custom
  input, `runTurnGeneration`, legacy Retry) store the immediate save in
  `turnSaveRef`, and `generateTrackedTurn` awaits it before
  `endTurnKeepAlive`. `MenuPage`'s `onSaveProgress` (typed `Promise<void>`)
  is wrapped to keep its type.
- **Legacy Retry now saves immediately** (`saveProgress(storyData, true)`)
  instead of after the 3 s debounce, so there is a promise to await. The
  only visible effect is the write landing sooner.
- **Stop detection** reads the `abortSignal` passed in the turn's options as
  well as `generationAbortRef.current?.signal.aborted`, since `handleStop`
  may replace the ref.
- **"ready"** needs `result.success`, non-empty `result.content`, a save that
  resolved true, and no abort. Any throw is "failed" unless aborted.
- **Turn id** comes from `newTurnId()` in `turnKeepAlive.ts`:
  `crypto.randomUUID()` with a time-and-random fallback (the codebase has no
  shared fallback helper). The ready notification's body is
  `story_name`, or "Your Story" when blank.
- **Icon.** Only `@mipmap/ic_launcher` exists, so both notifications use it
  as the small icon. Android masks small icons to a silhouette, so it may
  show as a plain square; a proper monochrome `ic_stat_*` drawable is a
  follow-up.
- **Native threading.** `begin` is an intent, so it reaches
  `onStartCommand` after anything posted straight to the main looper. `end`
  therefore records the ended id on the main looper and `onStartCommand`
  always calls `startForeground` first (the OS kills the app otherwise), then
  `stopSelf()` if `shouldStart(pendingId, endedId)` says the turn already
  ended. `shouldStart` is the pure rule.
- Not checked here: nothing in `android/` compiled (no SDK); CI is the first
  compile.

### 2026-10-23, slice 2 (the interrupted turn)

- **The mark is a first argument to `generateTrackedTurn`**: `({ mode, text,
  partsBefore }, ...generateStoryTurn args)`. The wrapper cannot know
  `partsBefore` (custom input and choices have already pushed the player's
  line by then), so each caller captures it. `runTurnGeneration` takes it as a
  required `opts.turn`, so the choice and reroll paths share one marking point;
  the legacy reword path calls the wrapper directly.
- **For `"retry"` (reroll and reword) `partsBefore` is the length when
  `handleRetry` began**, the turn being redone included, not the length after
  its pops. Cutting to the shorter length would delete the whole previous
  turn on load, and the banner's Retry (`handleRetry`) rerolls the last turn,
  so it needs that turn to still be there. `text` is kept for display only.
- **Banner Retry for `"new"` calls `handleCustomInput(text)`** with the
  original line (`customText`, or `choice.text` for a choice), so it adds the
  `>` prefix itself; a voice line is resent as freeform and a choice's
  `playerComment` is not kept.
- **Cleared** in the wrapper's `finally` when the turn is settled: stopped,
  `result.success` false (the page's `onError` already reports it), a thrown
  error (the callers' catch reports it), or saved. Kept only when a successful
  turn's save did not resolve true. `handleStop` also clears through
  `liveTurnRef`.
- **`intro_override` branch** marks and clears itself (it never reaches the
  wrapper), and its three `saveProgress(storyData)` calls became awaited
  immediate saves so the clear can follow a resolved write. Only visible
  effect: the write lands sooner than the 3 s debounce.
- **Dismiss saves the repaired story** (`saveProgress(story, true)`); load only
  repairs in memory, and without that save the half turn would come back from
  disk on the next load.
- The banner hides while a turn is loading.
- Not run: the browser preview check in the slice's "Check".
