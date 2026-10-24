# Feedback in the app

Status: **design and plan, waiting for the author's approval.** Decisions
190–193 (the interview of 2026-10-24). The author: "having feedback tools
inside of the app. So people can give feedback on the default systems or the
game, experience, etc."

## 1. What the author decided

- **190, storage**: a `/feedback` endpoint on the existing Cloudflare sync
  Worker (`sync-worker/`), stored in its KV. No accounts, no new service.
  Private: only the author reads it.
- **191, contents**: a rating, the player's words, what it is about, the app
  version and platform. Attaching the turn (its prose, rolls and tool calls)
  is an unticked checkbox. Never keys, never other stories.
- **192, entry points**: on a turn, on a built-in system or starter, in the
  menu / Settings, and after a session (a short, skippable prompt).
- **193, reading**: a private page, behind a secret the author keeps.

## 2. What a submission is

```ts
// app/misc/feedback.ts
export interface FeedbackSubmission {
  v: 1;
  kind: "turn" | "system" | "starter" | "session" | "app";
  /** What it is about: a system or starter id ("builtin:blood-and-bone:grave-watcher"), or none. */
  targetId?: string;
  /** 1-5, or none when the player only wrote. */
  rating?: number;
  text: string;                // up to 2,000 characters
  contact?: string;            // optional, up to 200; the form says it is stored as written
  app: { version: string; platform: "desktop" | "android" | "ios" | "web" };
  /** Only when the player ticked "Attach this turn". */
  turn?: {
    playerLine: string;        // up to 1,000
    prose: string;             // up to 6,000
    work: string[];            // the turn's tool calls and results as the player's view shows them
                               // (redactForPlayer: hidden notes stay "(hidden note)"), up to 8,000 in all
    models: string[];          // the models the turn used
    system?: string;           // the story's system id
    setting?: string;          // systemState.setting
  };
}
```

- **Never sent**: keys, settings, the story's other parts, notes, the sheet,
  the player's name, any device or install id. The turn attachment goes
  through `redactForPlayer`, so a GM secret is never in it.
- **Size**: the Worker refuses a body over 24 KB.

## 3. The Worker (`sync-worker/src/index.ts`)

- `POST /feedback`: validates the shape and sizes (anything else is a 400),
  stores it in KV under `feedback:<ISO time>:<random 8>` with a one-year TTL,
  and returns `{ ok: true }`. Rate limit by IP with the Worker's existing
  limiter: 10 submissions an hour.
- `GET /feedback/list?cursor=…`: `Authorization: Bearer <FEEDBACK_ADMIN_TOKEN>`
  (a `wrangler secret`); returns up to 100 entries, newest first, and a cursor.
- `GET /feedback/admin`: a small HTML page served by the Worker. It asks for
  the token (kept in the page's `sessionStorage`), lists the entries with
  filters (kind, system or starter, rating, has a turn attached), and opens one
  to read its text and the attached turn. Read-only. No delete in v1 (the TTL
  expires them; the Cloudflare dashboard can delete).
- **CORS**: `ALLOWED_ORIGINS` gains the native apps' origins (the Tauri
  webview's and Capacitor's), checked against what `syncManager` already sends;
  the admin page is same-origin.
- `sync-worker/README.md`: the endpoint, the secret, the page, and the
  `wrangler deploy` the author runs (a deploy is the author's).

## 4. The app

- `app/misc/feedbackClient.ts`: `sendFeedback(submission)` posts to
  `${NEXT_PUBLIC_SYNC_API_URL}/feedback` through `getProviderFetch()` (the
  desktop allowlist already admits the Worker's `workers.dev` host). With no
  sync URL configured, the feedback entries are hidden.
- `app/components/FeedbackModal.tsx`: a short form, the ys tokens,
  `useBackHandler`: 1–5 stars (optional), a text box, the optional contact,
  "Attach this turn" (only when it comes from a turn), a line saying what is
  sent and that it goes to the developer, Send. A failed send keeps the draft
  and shows the error; no retry queue.
- **Entry points** (decision 192):
  1. **A turn**: "Feedback on this turn" in the turn's ⋯ menu (`TurnActions`),
     kind `turn`, "Attach this turn" offered.
  2. **A system or starter**: a "Feedback" button on each built-in system and
     starter row in the Library (`BuiltinSystemsSection`), kind `system` /
     `starter`, `targetId` its id.
  3. **The menu and Settings**: "Send feedback" in the story menu
     (`StoryMenuSheet`) and in Settings, kind `app`.
  4. **After a session**: when a turn ran `end_session` (Blood & Bone's dawn),
     a one-line card under that turn: "How was tonight's session? ★★★★★ ·
     Write more · ✕". Stars alone send a `session` submission; "Write more"
     opens the modal. Shown once per session, never in party or online play
     (the host's screen is shared), and a Settings switch turns it off
     (`feedbackPrompts`, device-only, on by default).
- **Online guests and party phones**: no feedback entries (v1).
- `app/privacy/page.tsx`: a paragraph on what feedback sends and where.

## 5. Files

- `sync-worker/src/index.ts`, `sync-worker/wrangler.toml` (the origins),
  `sync-worker/README.md`.
- New: `app/misc/feedback.ts`, `app/misc/feedbackClient.ts`,
  `app/components/FeedbackModal.tsx`, `app/story/SessionFeedbackCard.tsx`.
- `app/story/StoryTurn.tsx` / `TurnActions`, `app/library/BuiltinSystemsSection.tsx`,
  `app/story/StoryMenuSheet.tsx`, the Settings tab, `app/privacy/page.tsx`.
- Tests: the submission builder (sizes, what is never included, the turn
  attachment redacted), the client (the URL, no URL hides it), the Worker's
  validation and auth (a unit test against its handler), the session card's
  once-per-session rule. `tests/themeTokensOnly.test.ts` lists the new files.

## 6. Verification

The suite and `tsc`; the browser preview for each entry point, the modal and
the session card; the desktop app sending one submission to a locally run
Worker (`wrangler dev`) and the admin page listing it. The real Worker deploy
and its secret are the author's: listed in `docs/pending_tests.md`.

## 7. Not in this

Replies to players, feedback from online guests and party phones, a public
roadmap, GitHub issue export, analytics of any kind.
