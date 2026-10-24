# Feedback in the app

Status: **design and plan, revised after Codex's review (2026-10-24);
waiting for the author's approval.** Decisions 190–193. The author: "having
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
