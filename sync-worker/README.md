# your-story-sync

Minimal Cloudflare Worker + KV backend for cross-device sync of Endless Adventure's
local data (stories, adventures, notes, tables, folders, settings). No accounts — the app
generates a random "sync key" that doubles as the client-side encryption key;
this worker only ever stores encrypted blobs, keyed by a hash of that key.

## Setup

```bash
cd sync-worker
npm install
npx wrangler login
npx wrangler kv namespace create SYNC_KV
# paste the returned id into wrangler.toml under [[kv_namespaces]]
```

Edit `wrangler.toml`'s `ALLOWED_ORIGINS` to a comma-separated list including
your deployed app's origin (and `http://localhost:3000` for local dev).

**Note on the native builds (Tauri/Capacitor):** `ALLOWED_ORIGINS` only
matters for requests that actually go through a browser's CORS-enforcing
fetch - i.e. the Vercel testing deployment and local dev in an ordinary
browser tab. The compiled desktop (Tauri) and mobile (Capacitor) apps both
route their HTTP through a native client instead of the WebView's `fetch`
(see `app/misc/platformFetch.ts` / `capacitor.config.ts`'s `CapacitorHttp`),
which isn't subject to CORS at all, so no origin entry is needed for those.
You still need `NEXT_PUBLIC_SYNC_API_URL` baked in at build time for each
target, since it's a `NEXT_PUBLIC_` var inlined at build, not read at
runtime.

## Local dev

```bash
npm run dev
```

## Deploy

```bash
npm run deploy
```

Copy the deployed `*.workers.dev` URL into the Next.js app's
`NEXT_PUBLIC_SYNC_API_URL` env var.

## API

All routes require `Authorization: Bearer <syncKey>`.

- `GET /sync/manifest` — `{ [bucket]: updatedAt }` for whichever buckets exist.
- `GET /sync/:bucket` — `{ ciphertext, iv, updatedAt }` or 404.
- `PUT /sync/:bucket` — body `{ ciphertext, iv, updatedAt }`, overwrites.

An origin outside `ALLOWED_ORIGINS` gets no `Access-Control-Allow-Origin`
header on any route.

`bucket` is one of `stories | adventures | notes | tables | folders | settings`.

## Feedback

`POST /feedback` takes player feedback into a D1 database; `GET /feedback/admin`
is a private page to read it. Design: `docs/feedback-design.md`. No IP address
and no request body is stored or logged; the IP reaches only the burst
limiter. The deploy is the author's.

### Set up

```bash
cd sync-worker
npx wrangler d1 create endless-adventure-feedback
# paste the returned database_id into wrangler.toml, replacing
# REPLACE_AFTER_wrangler_d1_create
npx wrangler d1 migrations apply endless-adventure-feedback --local
npx wrangler d1 migrations apply endless-adventure-feedback --remote
npx wrangler secret put FEEDBACK_ADMIN_TOKEN   # a long random string
npm run deploy
```

The burst limiter is the `[[ratelimits]]` binding `FEEDBACK_RATE_LIMITER`
(5 per 60 seconds per IP), in the form wrangler 4 documents (4.36 or later).
`period` can only be 10 or 60. If the binding is absent (an old local config)
the limit is skipped; the daily cap still applies.

### Reading it

Open `https://<your-worker>.workers.dev/feedback/admin` and enter the token.
The token is kept in the page's memory only and asked again on reload. Lists
are newest first, with filters (kind, system, starter, rating, handled) and
Load more; an item opens in full and can be marked handled. With no
`FEEDBACK_ADMIN_TOKEN` secret set, every admin route refuses.

- **Rotate the token**: `npx wrangler secret put FEEDBACK_ADMIN_TOKEN` with a
  new value (the old one stops working at once).
- **Kill switch**: set `FEEDBACK_ENABLED = "false"` in `wrangler.toml` and
  deploy; submissions get 503 `disabled`. `FEEDBACK_DAILY_CAP` (default 300) is
  the global number of new submissions a UTC day.
- **Delete one submission by its ref** (the first 8 characters of its id,
  shown to the player after sending):

  ```bash
  npx wrangler d1 execute endless-adventure-feedback --remote --command "DELETE FROM feedback WHERE id LIKE '<ref>%'"
  ```

- **Retention**: a daily cron (`0 3 * * *`) deletes submissions older than 180
  days and the daily-cap counters older than 2 days.
