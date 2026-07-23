# your-story-sync

Minimal Cloudflare Worker + KV backend for cross-device sync of Your Story's
local data (stories, adventures, notes, folders, settings). No accounts — the app
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

`bucket` is one of `stories | adventures | notes | folders | settings`.
