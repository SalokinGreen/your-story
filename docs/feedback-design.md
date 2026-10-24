# Feedback in the app

Status: **built (2026-10-24, decision 194), revised after Codex's review;
see the devlog `docs/devlog/2026-10-24-feedback.md`.** Decisions 190–194. The author: "having
feedback tools inside of the app. So people can give feedback on the default
systems or the game, experience, etc." Codex's review is
`docs/research/codex-feedback-review-2026-10-24.md`.

## 1. What the author decided, and what the review changed

- **190, storage: the existing sync Worker.** Revised: the Worker stores
  feedback in **Cloudflare D1** (a SQL database bound to the same Worker),
  not in its KV. KV cannot count atomically, allows one write per second per
  key and 1,000 writes a day on the free plan; D1 gives an atomic daily cap,
  newest-first paging and server-side filters in one query, with 100,000
  writes a day free. Still no accounts, private, one Worker.
- **191, contents: text and an optional turn.** Revised (Codex's cuts): no
  contact field (there are no replies in v1), and the turn attachment is an
  explicit allowlist the player previews before sending (§2), not "the work
  line minus hidden notes".
- **192, entry points**: all four, unchanged in place; every one opens the
  same form, and stars are sent with Send, never on tap.
- **193, reading**: a private page, hardened (§4).

## 2. What a submission is

```ts
// app/misc/feedback.ts
export interface FeedbackSubmission {
  v: 1;
  id: string;                 // client-made random id, reused on a retry (no duplicates)
  kind: "turn" | "system" | "starter" | "session" | "app";
  systemId?: string;          // "blood-and-bone", from resolveSystem(), never from lore
  starterId?: string;         // "builtin:blood-and-bone:grave-watcher" when the story came from one
  rating?: 1 | 2 | 3 | 4 | 5;
  text: string;               // 0-2,000 characters; a rating or non-blank text is required
  app: { version: string; platform: "desktop" | "android" | "ios" | "web" };
  session?: number;           // kind "session": the night's number from end_session (1-10,000)
  turn?: {                    // only when "Attach this turn" is ticked
    playerLine: string;       // up to 1,000
    prose: string;            // up to 4,000
    rolls: string[];          // up to 12 one-line roll summaries ("Face Danger +Shadow: weak hit")
    models: string[];         // up to 4 model names
  };
}
```

- **The attachment is an allowlist**: the player's line, the turn's prose, and
  one-line summaries of its rolls (the work line's labels, never a tool
  result body). **Never**: reasoning, tool arguments or results, note or memory
  text, the sheet, other turns, keys, settings, a device id. `||hidden||`
  spans in prose are removed before it is cut to length.
- **The player sees exactly what is sent**: ticking "Attach this turn" shows
  the attachment's text, editable, so a name or something private can be
  removed. The form says plainly that feedback goes to the developer and is
  readable by them.
- **Sizes**: every field is capped as above; the whole body is at most 16 KB
  of UTF-8, enforced by the Worker while reading the body, before parsing
  (413 if over). Validation is a strict runtime schema (§3): unknown fields,
  wrong types, a fractional rating, or a submission with neither a rating nor
  text is a 400.
- **Version**: one canonical source (`package.json`'s version, baked into the
  build) for every platform.

## 3. The Worker (`sync-worker/`)

- **D1**: `wrangler.toml` binds a `FEEDBACK_DB` database; a migration creates
  `feedback(id TEXT PRIMARY KEY, received_at INTEGER, kind, system_id,
  starter_id, rating, text, app_version, platform, turn_json, handled INTEGER
  DEFAULT 0)` with an index on `received_at`, and `feedback_day(day TEXT
  PRIMARY KEY, n INTEGER)`.
- **`POST /feedback`**: in order: the kill switch (`FEEDBACK_ENABLED` var,
  "false" refuses with 503); the body size; the burst limit (Cloudflare's
  rate-limit binding, 5 per 60 seconds per `CF-Connecting-IP`); the schema;
  the global daily cap (`INSERT … ON CONFLICT DO UPDATE SET n = n + 1
  RETURNING n`, refused past `FEEDBACK_DAILY_CAP`, default 300); then
  `INSERT OR IGNORE` by `id` (a retried submission is stored once). Returns
  `{ ok: true, ref: "<first 8 of id>" }` only after the insert. The IP is used
  for the burst limit only and never stored; no request body is logged.
- **CORS**: `POST` and its preflight are added for `/feedback`; the allowed
  origins are the web build's; an unknown origin gets no allow header (today it
  falls back to the first origin). CORS is a browser rule, not protection: the
  limits above are. The native apps do not depend on it (§5).
- **Retention**: 180 days; a scheduled Worker trigger (cron, daily) deletes
  older rows.
- **Admin** (`/feedback/admin`, `/feedback/api/list`, `/feedback/api/item`,
  `/feedback/api/handled`): every data route needs `Authorization: Bearer
  <FEEDBACK_ADMIN_TOKEN>` (a `wrangler secret`; a missing secret refuses
  everything) and returns `Cache-Control: no-store`. The page is a static shell
  with a strict CSP (`default-src 'self'; frame-ancestors 'none'`), `nosniff`;
  it keeps the token **in memory only** (re-entered on reload), renders every
  submitted field with `textContent` (never `innerHTML`, no links, no
  images), lists summaries newest first (date, ref, kind, system/starter,
  rating, the first 120 characters, has a turn, platform/version) with
  server-side filters (kind, system, starter, rating, handled) and Load more,
  opens one to read it in full (the attachment fetched on demand), and marks it
  handled. Deleting a row on request: by its `ref`, a documented `wrangler d1
  execute` command in the README.
- `sync-worker/README.md`: creating the D1 database, the migration, the
  secret, the vars, the cron, deploying, rotating the token, deleting by ref.
  The deploy is the author's.

## 4. Privacy

`app/privacy/page.tsx` is revised where it now says the developer stores
nothing: feedback is the one exception. It says what feedback sends (§2),
that it is optional and readable by the developer, that it is stored in
Cloudflare D1 for 180 days, that the IP address reaches Cloudflare and is
used only to limit abuse and not stored with the feedback, that encrypted
sync is unrelated, and how to ask for a submission to be deleted (its ref,
shown after sending, and the repository's contact). A short line under Send
links to it.

## 5. Platforms

| Platform | How the request goes | What it needs |
|---|---|---|
| Desktop (Tauri) | native HTTP (`getProviderFetch`), no CORS | the Worker URL inside the capability's scope (`https://your-story-sync.*.workers.dev/*` today); a dev-only capability for `http://localhost:8787` (the local Worker) in debug builds only |
| Android / iOS (Capacitor) | the patched native fetch, no CORS | a POST with a JSON reply works through it; checked on Android, iOS owed |
| Web | browser fetch | CORS with POST (§3) |

- **The URL** is `NEXT_PUBLIC_SYNC_API_URL`, baked into the static export;
  `.github/workflows/build-apps.yml` and `scripts/build-standalone.mjs` pass it.
  The feedback entries show only when it is set (not when sync is on).
- **Offline or failed**: the form keeps the draft (in memory, and in
  `localStorage` per entry point until sent or discarded), shows which failure
  it was (offline, too many, server), and never resends on its own; a retry
  reuses the draft's `id`.

## 6. The app

- `app/misc/feedback.ts`: `buildSubmission(...)` (the allowlist, the caps,
  `||hidden||` removal before cutting, the version), `validate` shared with the
  Worker's schema (the same file is imported by the Worker's build, or the
  schema is duplicated with a test that they agree).
- `app/misc/feedbackClient.ts`: `sendFeedback()` through `getProviderFetch()`,
  importing nothing from sync (no keys, no sync headers).
- `app/components/FeedbackModal.tsx`: stars (optional), text, "Attach this
  turn" with its editable preview, the privacy line, Send. `useBackHandler`,
  focus trap, Escape, focus returns to where it opened, safe-area padding;
  closing keeps the draft.
- **Entry points** (decision 192), each opening the modal:
  1. a turn's ⋯ menu ("Feedback on this turn"; `story.tsx` owns the part and
     passes a snapshot of it), kind `turn`;
  2. the Library's built-in system and starter rows (`BuiltinSystemsSection`),
     kinds `system` / `starter`;
  3. the story menu (`menu.tsx`, closing the menu first) and Settings, kind
     `app`;
  4. **after a night**: when a saved turn has an executed `end_session` result
     (`result.type === "end_session"`), a one-line card under it: "How was
     tonight? · Give feedback · ✕". It opens the modal (kind `session`, the
     session number from the result). Shown for the newest completed night
     only, once: a device-local marker per story and session number
     (offered / dismissed / sent), not synced. Never in couch co-op, party or
     online play (a shared screen). A Settings switch, "Ask for feedback after
     a night", turns it off (device-only, on by default).
- Online guests and party phones get no entry point.

## 7. Files

- `sync-worker/src/index.ts`, `sync-worker/wrangler.toml`,
  `sync-worker/migrations/0001_feedback.sql`, `sync-worker/README.md`.
- New: `app/misc/feedback.ts`, `app/misc/feedbackClient.ts`,
  `app/components/FeedbackModal.tsx`, `app/story/SessionFeedbackCard.tsx`.
- `app/story/story.tsx`, `app/story/StoryTurn.tsx` (TurnActions),
  `app/library/BuiltinSystemsSection.tsx`, `app/story/menu.tsx`, the Settings
  tab, `app/privacy/page.tsx`, `src-tauri/capabilities/` (the dev-only
  capability), `.github/workflows/build-apps.yml`, `scripts/build-standalone.mjs`.
- Tests: the submission builder (the allowlist; nothing outside it; caps;
  `||hidden||` before cutting; multibyte sizes); the Worker against its handler
  with a D1 stand-in (schema refusals, 413, the daily cap, the kill switch,
  duplicate id, admin auth, `no-store`, a hostile string rendered as text in
  the page's renderer); the client (URL, nothing from sync); the session card
  (an executed result only, couch/party/online off, once per night through a
  reload, Undo).

## 8. Verification

The suite and `tsc`; the browser preview for every entry point, the modal and
its preview, the session card; the **compiled** desktop app (debug capability)
sending to `wrangler dev` with a local D1, and the admin page listing,
opening and marking it; an Android APK sending to the same local Worker over
the LAN if reachable, else owed. The real D1, secret and deploy are the
author's: `docs/pending_tests.md`.

## 9. Not in this

Replies and a contact field, raw tool output or reasoning in attachments,
feedback from guests and phones, ratings dashboards, search, GitHub export,
analytics.

## Decisions made during implementation (2026-10-24)

### Worker

- **Duplicate ids do not burn the daily cap.** The handler reads `SELECT 1 FROM feedback WHERE id = ?` first and answers a stored id with the same `{ok, ref}` before the cap counter runs. The cap counter increments before the insert, so a submission refused for the cap still counts toward the day (bounded, and it keeps the check a single statement).
- **Order**: kill switch, then body size (Content-Length early, then the stream, stopped past 16,384 bytes), then the burst limiter, then JSON and schema, then the duplicate check, the cap and `INSERT OR IGNORE`. A missing `FEEDBACK_RATE_LIMITER` allows and continues.
- **Lengths are JS string lengths** (UTF-16 units), so an emoji counts as 2 toward a field cap; the 16 KB body cap is bytes. Unknown keys are refused anywhere, including `app` and `turn`. A `turn`, when present, needs all four of its fields; `systemId` and `starterId` must be non-empty when present; `app.version` must be 1-32 characters.
- **Rate limiter binding**: `[[ratelimits]]` with `[ratelimits.simple]` (`limit = 5`, `period = 60`, `namespace_id = "1001"`), the form wrangler 4 documents; checked with `wrangler deploy --dry-run` on wrangler 4.113.0, which listed it as "5 requests/60s".
- **CORS fix applies to every route**: an unknown or absent origin gets no `Access-Control-Allow-Origin` at all (it used to get the first allowed origin). Methods are now `GET, PUT, POST, OPTIONS` for sync too; nothing else in the sync routes changed.
- **Admin page** is three static responses (`/feedback/admin`, `/feedback/admin.js`, `/feedback/admin.css`) under one CSP with no inline script or style (`default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`), so no nonce is needed. The pages are public; only the data routes need the token. The script builds everything with `createElement` and `textContent`, and builds no links or images.
- **Auth**: both sides are SHA-256 hashed, then compared with an XOR loop over equal lengths. A missing or empty `FEEDBACK_ADMIN_TOKEN` gives 503 on every data route; a wrong or missing token gives 401. All data responses carry `no-store`.
- **List cursor** is `received_at < before`, newest first, ties broken by id descending; two rows in the same millisecond at a page boundary could be skipped (negligible at this volume). The response is `{items, next}`; `next` is the last item's `received_at`, or null when the page came back short.
- **`FEEDBACK_ENABLED`** is read as the string `"false"` only; a missing D1 binding is also 503 `disabled`.
- **Types**: `feedback.ts` declares its own structural `D1Like`, `RateLimitLike` and `KVLike` (and `index.ts`'s `Env` uses `KVLike`), so the root `tsc`, which does not carry `@cloudflare/workers-types`, can check the test that imports the Worker. The Worker's own `tsc` is clean.
- **Tests** use `node:sqlite` (Node 24, built in, no new dependency) as the D1 stand-in and run the real migration file, so the SQL is executed rather than matched. The hostile-string test runs the page script against a small fake DOM and asserts the string lands only in `textContent` values, with no `innerHTML` write and no `img` or `a` element; a second test greps the script source for HTML sinks.
- **Retention** runs from `scheduled()` (cron `0 3 * * *`): `feedback` older than 180 days, `feedback_day` older than 2 days (by day string).

### App

- **One host, one launcher.** The form is mounted once, in the root layout (`FeedbackHost`), and every entry point calls `openFeedback(request)` (`app/misc/feedbackLauncher.ts`, a `window` event). So the story menu sheet and the Settings view can close or sit underneath it without taking it away, and focus goes back to the opener on close. The form is `z-200` to sit over Settings (`z-100`). Party phones render the layout too but never fire the event.
- **Files**: `app/misc/feedback.ts` (types, `buildSubmission`, `validateSubmission`, `turnAttachmentFrom`, `starterIdFor`, `newFeedbackId`, `appVersion`, `appPlatform`), `feedbackClient.ts`, `feedbackSession.ts` (the pure "How was tonight?" decision and the localStorage markers), `feedbackLauncher.ts`; `FeedbackModal.tsx`, `FeedbackHost.tsx`, `FeedbackSettingsSection.tsx`, `app/story/SessionFeedbackCard.tsx`. Tests: `tests/feedback.submission.test.ts`, `feedback.client.test.ts`, `feedback.sessionCard.test.ts`; the four new `.tsx` files are in `tests/themeTokensOnly.test.ts`.
- **`getProviderFetch()` takes no URL** (the brief said `getProviderFetch(url)`); the client calls it bare, as every other caller does.
- **`validateSubmission` is the schema only, not the body size.** The 16 KB cap is `bodyBytes()` against `FEEDBACK_LIMITS.bodyBytes`, answered by the Worker with 413. `field` is dotted for nested keys (`turn.prose`, `app.platform`); the Worker's `field` strings for nested keys were not specified, so an agreement test should compare `ok`, not `field`, for those. `systemId`/`starterId` must be non-empty when present, `app.version` 1-32, a `turn` needs all four fields, lengths are UTF-16 units: the same as the Worker builder's notes above.
- **Hidden spans**: the app marks them `||text||` (`parseHiddenText` in `StoryTurn.tsx`). `stripHiddenSpans` removes closed spans first, and a lone `||` with no closer hides everything after it, so a half-streamed or malformed span cannot leak. A turn's prose also goes through `extractVisibleText` (no `<thinking>`) and `redactForPlayer` (no `[[HIDDEN_LORE]]`).
- **The attachment's rolls** are `rollHeadline()` (the work line's own helper, `app/story/turnWork.ts`) over the part's saved `gmToolCalls`, only for a call that succeeded and was not `hiddenFromPlayer`. `gm_roll` is not in its roll list. The model is the part's `reasoningTierModelKey` through `getTierModelDisplayName`; the narrator model is not recorded per part, so only that one is sent.
- **Fitting 16 KB**: `fit()` binary-searches the longest prose that makes the body fit (a character costs 1 to 6 JSON bytes), then the player's line, then the free text, then drops rolls and models. A first version that cut `over` characters wiped a multibyte prose; the multibyte test catches it. A cut never splits a surrogate pair.
- **The starter is derived**, because a story does not record where it came from (`sourceAdventureId` in `page.tsx` is never set). `starterIdFor(story, system)` picks the starter of the resolved system whose `storyTemplate.systemState.setting` equals the story's and at least half of whose note titles are still in the story. A story of the player's own making returns null; a Europe by Night story with most of the Hollow Hour's notes would be called the Hollow Hour (best effort, and `systemId` is exact). `systemId` is `resolveSystem(story).system?.id`, never read from lore text.
- **Session card**: executed means `success === true`, `toolName === "end_session"` and `result.type === "end_session"` on a saved `gmToolCalls` entry; the night number is `result.sessionCount` (the count after the call). The marker `offered` (written when the card first appears) still shows the card, so a reload mid-night does not lose the ask; `dismissed` and `sent` hide it. Only the newest executed night is considered: dismissing night 2 does not bring night 1's card back. Couch co-op is `storyData.multiplayer.enabled`, party is `partyTable`, online is any `netSession`. The card also waits for the turn to finish (`!loading && !loadingStage`).
- **Settings**: the "Ask for feedback after a night" switch and a "Send feedback" button sit in Settings → Game (`FeedbackSettingsSection`), shown only when the Worker address is set. Settings cannot tell a guest from a host, so any online session hides the button there (`isOnlineSessionActive()`); the story menu hides its row for a guest only. `ys:feedbackAfterNight` and `ys:feedbackSession:*` are not in `syncableSettingsKeys.ts`; a test says so.
- **Turn entry**: a "Feedback" icon (message square) in the turn's actions row, on every GM turn, not shown to an online guest or when the address is unset. It is not disabled by the row's busy state differently from the other buttons (it shares `disabled`).
- **Draft**: kept in memory and under `ys:feedbackDraft:<kind>:<target>` (turn: `<storyId>:<part id or index>`; system/starter: the id; session: `<storyId>:<night>`; app: `app`) from the first edit until sent or "Discard draft". Closing (X, Cancel, backdrop, Escape, Android back) keeps it; closing aborts a send in flight, and the retry reuses the draft's id. The attached turn's text is stored in the draft once ticked.
- **Version**: `next.config.ts` reads `package.json` with `process.cwd()` and bakes `NEXT_PUBLIC_APP_VERSION`; the static export gets it the same way. Outside a build it reads "0.0.0". Platform: Tauri is `desktop`, Capacitor in the standalone build is `android` or `ios`, anything else `web`.
- **Build plumbing**: `scripts/build-standalone.mjs` already passed the whole environment through; it now warns when `NEXT_PUBLIC_SYNC_API_URL` is unset (Next also reads `.env.local`). `.github/workflows/build-apps.yml` sets it for every job from the repository variable `NEXT_PUBLIC_SYNC_API_URL` (a variable, not a secret; the author sets it). The workflow was not run.
- **Desktop scope**: `capabilities/default.json` already admits `https://your-story-sync.*.workers.dev/*`; a Worker on a custom domain would need its own entry. Tauri 2 has no per-profile capability, so the debug-only scope for `http://localhost:8787/*` is an inline capability in `src-tauri/tauri.dev.conf.json`, merged only when that file is passed: `npx tauri build --debug --config src-tauri/tauri.dev.conf.json` or `npx tauri dev --config src-tauri/tauri.dev.conf.json` (it lists `"default"` too, because naming any capability turns the rest-of-the-folder default off). A plain `tauri build` never reads it, so a release has no localhost scope. Not built or launched here.
- **Privacy page**: new "Feedback You Send" section, the intro and TL;DR revised, date moved to October 24, 2026. Deletion is by the reference, through a GitHub issue.
- **Not verified here**: nothing was rendered or launched (the parent does the preview), no `tauri build`, no real send to a Worker, no Android or iOS run, and no check that `--config` accepts the inline capability form on this Tauri version.

### Review and verification (the parent session)

- `tests/feedback.schemaAgreement.test.ts` runs 38 cases through both
  validators. It found one disagreement: the app refused `session` on a kind
  other than `session`, and the Worker accepted it. The app now accepts it, as
  the contract says the number only *matters* for kind `session`.
  `buildSubmission` still drops it for other kinds.
- The Library's starter button row wraps (`flex-wrap`, `min-w-0`). With the
  added Feedback button it pushed the page to 465 px on a 375 px screen.
- Run end to end against `wrangler dev` with a local D1, from the web preview
  and a debug desktop build; see the devlog.
