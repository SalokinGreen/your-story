**The design needs revision before implementation.** Decisions 190–193 fit the product, but the proposed abuse control, attachment privacy guarantee, native verification, and session rule are incomplete. These are findings about the design; feedback is not implemented yet. I edited nothing.

Ranked below, with the design section, problem, and concrete fix.

1. **High — The existing limiter cannot enforce the proposed limit.**  
   **§3.** [`checkRateLimit`](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/sync-worker/src/index.ts:44) counts by **sync-key hash + IP + minute**, with a 60-request limit. Feedback has no sync key. Its KV read/increment/write is non-atomic, eventually consistent, and can exceed KV’s **one write per second per key** limit during bursts. Copying it and changing two constants is insufficient.  
   **Fix:** give feedback independent limiting, using trusted `CF-Connecting-IP`, with burst protection and an atomic hourly counter if “10/hour” is a requirement. A Durable Object can provide that within the Worker deployment. Cloudflare’s rate-limit binding is another option for approximate burst protection, but supports 10/60-second periods and is not a strict global limiter. Account for shared mobile/NAT addresses. [KV limits](https://developers.cloudflare.com/kv/platform/limits/), [rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

2. **High — An open endpoint has no aggregate cost or availability boundary.**  
   **§3.** Anyone can reproduce the request from the public source. CORS is enforced by browsers; curl ignores it, and an attacker can supply an allowed `Origin`. An embedded application secret would also be public. IP rotation defeats an IP-only allowance. Sharing the Worker/KV budget makes feedback abuse capable of disrupting sync.  
   **Fix:** add a global acceptance budget, a feedback kill switch, and documented quota handling. Reject excess traffic before storage work where possible. Treat the endpoint as anonymous and forgeable; use additional bot mitigation if attacks warrant it, with a native-compatible flow.

3. **High — KV costs are understated by omission.**  
   **§3.** On the free plan, KV allows **1,000 writes/day**. Reusing the current structure costs at least one counter write plus one submission write: roughly **500 successful submissions/day**, before sync and other limiter traffic. On paid plans, writes beyond the included million cost **$5/million**; storage beyond the included GB costs **$0.50/GB-month**. A year-long TTL magnifies sustained spam storage.  
   **Fix:** document the intended plan and operating budget, remove KV increments from the hot limiter path, choose justified retention, and handle quota failures without reporting success. A separate namespace aids separation but does not create independent account quotas. [Cloudflare KV pricing](https://developers.cloudflare.com/kv/platform/pricing/).

4. **High — Stored XSS prevention is unspecified for the admin page.**  
   **§3.** Every displayed field is attacker-controlled, including contact, target, version, model names, and attached tool output. A “small HTML page” assembled with `innerHTML` can turn one malicious submission into access to the entire inbox. Rendering Markdown images also enables tracking when the author opens feedback.  
   **Fix:** render submissions as plain text using `textContent` or escaped framework text nodes. Do not interpolate submissions into scripts or HTML templates, auto-load images, or automatically turn contact values into links. Add a restrictive CSP, `frame-ancestors 'none'`, and `nosniff` as secondary controls. [OWASP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).

5. **High — `sessionStorage` does not protect the admin bearer token.**  
   **§3.** It survives reloads and is readable by JavaScript on that origin. Any admin-page XSS can steal it and read feedback until rotation. Tab lifetime is not token expiry.  
   **Fix:** keep the token in memory for the smallest implementation, clear it on logout, and document rotation. Use a strong random secret stored only through Wrangler. Reject admin requests when the secret is unset; authenticate before listing or fetching values; return `Cache-Control: no-store` for private responses. A public login shell is fine—the data routes need protection. [OWASP storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

6. **High — “A GM secret is never in it” is false.**  
   **§2 and §5.** [`redactForPlayer`](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/turnTimeline.ts:80) removes marked hidden-lore spans and specially formatted secret-note sections. It leaves other text unchanged. Hidden tool exclusion is a **separate** timeline mechanism. Public `read_notes` results can contain the character sheet; `search_memory` can reproduce earlier story material; reasoning can paraphrase secrets without markers. Prose also has a separate `||hidden||` convention.  
   **Fix:** build attachments from an explicit export allowlist. Exclude reasoning, raw conversations, tool arguments, note/memory bodies, and hidden tools. For v1, export only selected roll summaries. Apply visibility filtering **before truncation**, and let players preview and remove attachment text.

7. **High — “Never names, notes, keys, or other parts” overpromises even after structural filtering.**  
   **§2 and §4.** Player lines and narration can contain real names, pasted credentials, sensitive personal experiences, copyrighted material, or quotations from earlier turns. Couch/party lines can include speaker names and other players’ words. Omitting corresponding `StoryData` fields cannot prevent that.  
   **Fix:** promise that the app does not automatically collect credentials or unrelated records. Explain that selected text may contain personal information; show the exact attachment before sending and advise removal of private material. Ensure the client uses `getProviderFetch()` directly, without importing sync authorization or provider-key headers.

8. **High — Adding one privacy paragraph leaves contradictory claims intact.**  
   **§4.** The [privacy page](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/privacy/page.tsx:103) says there is no database of its own, the developer has no story copy, and the app never asks for email/name. Its summary repeats those claims. Feedback introduces readable server-side storage and an optional contact field. Sync’s encryption explanation does not describe feedback.  
   **Fix:** revise those statements and the summary. Explain that feedback is optional, readable by the developer, stored through Cloudflare, retained for a stated period, and independent of encrypted sync. Put a short linked notice beside Send.

9. **High — Retention, contact collection, and deletion need an operational privacy plan.**  
   **§§2–4 and §7.** One year is unexplained; contact is collected despite replies being out of scope; `{ok:true}` gives the player no reference for a later request. Dashboard deletion can support v1, but only if someone can identify the record and process requests.  
   **Fix:** remove contact unless there is a defined use. Specify controller/contact details, purposes and lawful basis, recipients, retention, applicable rights and complaint route; assess Cloudflare’s processor agreement and international transfers. Provide a private request channel and an opaque submission receipt, with documented lookup/deletion. Attachment opt-in alone does not resolve processing of other people’s personal data. [GDPR, particularly Articles 5, 6, 13, 17, 28 and 44 onward](https://eur-lex.europa.eu/legal-content/ENG/ALL/?uri=celex%3A32016R0679), [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/).

10. **High — IP handling and logs are missing from the privacy description.**  
    **§3.** The current limiter stores the raw IP in its KV key for two minutes. An hourly adaptation would likely retain it longer. Cloudflare necessarily receives the connection IP; deployed logging settings may retain additional request information. The repository does not establish those production settings.  
    **Fix:** define the exact limiter retention, avoid putting IPs in submission records, and consider a short-lived keyed IP pseudonym for counters. Keep bodies, contact details, authorization headers, and attachments out of application logs. Audit deployment logging and disclose actual handling; do not call pseudonymized IPs anonymous.

11. **High — Browser feedback will fail preflight with the current CORS methods.**  
    **§3.** [`corsHeaders`](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/sync-worker/src/index.ts:26) advertises `GET, PUT, OPTIONS`, omitting `POST`. Cross-origin JSON feedback needs preflight. For an unrecognized origin, it returns the first configured origin rather than rejecting the request.  
    **Fix:** add route-appropriate `POST` preflight support and configure the actual testing-web origins. Return CORS headers consistently on errors. Keep admin data same-origin. Recognize that rejecting browser origins is an additional control, not authentication.

12. **High — The native-origin explanation confuses two different transports.**  
    **§§3–4.** The relevant platform behavior is:

    | Platform | What the code actually uses | Required correction |
    |---|---|---|
    | Tauri desktop | Native HTTP through [`getProviderFetch`](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/platformFetch.ts:24); browser CORS does not govern it. | Verify the URL against the Tauri capability scope. |
    | Capacitor Android | Patched native fetch; configured WebView origin defaults to `https://localhost`. | Do not assume `http://localhost`, or switch feedback to the chat-specific abortable fetch path. |
    | Capacitor iOS | Patched native fetch; default WebView origin is `capacitor://localhost`. | Test native POST and response handling on iOS. |
    | Web build | Ordinary browser fetch to the Worker. | Correct CORS and deployed-origin configuration are essential. |

    **Fix:** state this matrix in the design. `syncManager` does not explicitly send an `Origin`; inspect actual native requests before adding any server-side origin rejection, including requests with no Origin. [Tauri HTTP scope](https://v2.tauri.app/plugin/http-client/), [Capacitor HTTP](https://capacitorjs.com/docs/apis/http), [Capacitor configuration](https://capacitorjs.com/docs/config).

13. **High — The planned desktop-local-Worker verification is blocked by the allowlist.**  
    **§§4 and 6.** The [capability](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/src-tauri/capabilities/default.json:27) admits `https://your-story-sync.*.workers.dev/*`, not every `workers.dev` host, a custom domain, or `http://localhost:8787`. Adding CORS origins cannot grant native HTTP permission.  
    **Fix:** specify the supported production URL and a narrowly scoped development capability for local Worker testing. Exercise a compiled standalone desktop build; ordinary browser or non-standalone development testing does not prove the shipping path.

14. **High — Release configuration can hide the whole feature.**  
    **§§4–6.** `NEXT_PUBLIC_SYNC_API_URL` is baked into the static export. The [native build workflow](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/.github/workflows/build-apps.yml:13) does not supply it. Clean workflow builds therefore have no configured feedback URL unless the build process changes.  
    **Fix:** supply the public URL to every relevant build and test visibility in produced artifacts. Gate feedback on endpoint configuration, **not** on whether a player has enabled sync or possesses a sync key.

15. **High — The advertised character limits conflict with the body limit.**  
    **§§2–3.** Text, contact, player line, prose, and work alone allow 17,200 characters. CJK text can exceed 24 KB well before those limits; JSON escaping adds more overhead. Model arrays and several strings have no stated limits. Checking `Content-Length` alone does not bound an untrusted request.  
    **Fix:** define the total as UTF-8 serialized bytes, enforce it while reading the body before JSON parsing, and cap every string, array length, and aggregate. Fit the client attachment to that budget and show explicit truncation. Return a recognizable size error, normally 413.

16. **Medium — Runtime validation rules are underspecified.**  
    **§§2–3.** TypeScript interfaces do not validate requests. The design leaves blank submissions, fractional ratings, `null`, unknown fields, invalid nested types, and star-only submissions ambiguous. `text: string` must accommodate the latter.  
    **Fix:** specify a strict runtime schema: version 1, known kinds/platforms, integer rating 1–5, and at least a rating or nonblank text. Define per-kind target/attachment rules and normalize optional blank fields. Store a validated projection, with server-generated ID and receipt time.

17. **Medium — `end_session` is a game boundary, not the end of playing.**  
    **§4.** [`executeEndSession`](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/gmExecutor.ts:6191) increments `systemState.sessionCount` and immediately starts the next game session. Blood & Bone calls it at dawn; players may continue through several dawns in one sitting. Other stories may never call it. A requested or failed call also must not trigger feedback.  
    **Fix:** detect a **successful executed result** with `result.type === "end_session"`, after the completed turn is saved. Use its returned counter. Describe this as a game-session/night prompt; if the intended trigger is finishing a play sitting, define that separately.

18. **Medium — “Shown once per session” has no durable identity or lifecycle.**  
    **§§4–5.** Component state will reset on navigation/reload. Historical rendering could show old cards; retries, Undo, restored results, and synced stories complicate counter-only detection. “Shown,” “dismissed,” and “submitted” are different states.  
    **Fix:** define a device-local marker keyed by local story identity and the completed session boundary, with offered/dismissed/submitted states. Trigger newly completed boundaries rather than scanning history on every render. Specify behavior after Undo/retry and across devices. Keep these markers and `feedbackPrompts` outside sync.

19. **Medium — Couch co-op is missing from the shared-screen exclusion.**  
    **§4.** Couch players also share one screen. Excluding party and online play while showing automatic cards in couch mode contradicts the stated reason. Conversely, `multiplayer.enabled` alone is too broad to identify every mode correctly.  
    **Fix:** explicitly suppress automatic cards for active couch co-op, online sessions, and party tables. Preserve manual host feedback as designed, while warning that attached turns can contain other players’ contributions. Gate guest entry points as well as the card.

20. **Medium — Offline, ambiguous success, and rating interaction need defined behavior.**  
    **§4.** No retry queue is reasonable, but “keeps the draft” does not say whether closing the modal loses it. A timeout may occur after storage succeeded. Capacitor’s patched fetch does not reliably cancel through an `AbortSignal`. Immediate star submission also creates ambiguity when the player changes a rating or then selects “Write more.”  
    **Fix:** retain drafts locally until success or explicit discard, prohibit automatic resend, and distinguish offline/429/server errors. Give each draft a random submission ID reused on retry. Prefer selecting stars followed by Send; otherwise specify one-shot behavior and how “Write more” relates to an already-sent rating.

21. **Medium — The admin’s newest-first pagination contradicts the KV key scheme.**  
    **§3.** KV lists keys in ascending lexicographic order. `feedback:<ISO time>:…` yields **oldest first**. Reversing each page does not produce globally newest-first pagination. KV visibility can also lag.  
    **Fix:** use a fixed-width inverse timestamp in the key, followed by a collision-resistant random ID, and store actual receipt time in the value. Respect `list_complete`, including empty pages with a continuation cursor; tell the author that newly submitted records may briefly lag. [KV listing behavior](https://developers.cloudflare.com/kv/api/list-keys/).

22. **Medium — The inbox needs a useful browsing contract.**  
    **§§2–3.** Filtering only the first 100 loaded entries can hide matches elsewhere. Returning 100 complete attachments can transfer roughly 2.4 MB and require a value read per entry. There is no read/handled state. System/starter context disappears from turn/session feedback when attachment is unchecked, and version sources already disagree: package/Tauri `0.1.0`, Android `1.0`.  
    **Fix:** list compact summaries and fetch an attachment on demand through an authenticated detail route. Label filters as applying to loaded records unless server scanning is implemented. Include date, stable reference, target, rating, preview, version/platform, and attachment status. Use a canonical build-version source and explicit built-in system/starter IDs independent of attachment; derive the system through `resolveSystem()`, without uploading lore to infer it.

23. **Medium — The named UI files are not sufficient integration points.**  
    **§§4–5.** `TurnActions` is a callback-driven toolbar; its caller in `story.tsx` owns the selected part. `StoryMenuSheet` is a container, while `menu.tsx` renders the actual menu. Registering [`useBackHandler`](C:/Users/Nikolas/Documents/GitHub/your-story/.claude/worktrees/repo-health-check-13aa7a/app/misc/useBackHandler.ts:18) only handles Android back; it does not supply focus trapping or Escape coordination.  
    **Fix:** name `story.tsx`, `menu.tsx`, and the owning page in the implementation plan. Snapshot the selected turn when opening feedback. Either close the menu first or include feedback in its `modalOpen` coordination. Specify focus restoration, keyboard dismissal, safe-area layout, and draft-preserving close behavior.

24. **Medium — Verification does not cover the failure modes above.**  
    **§§5–6.** Browser preview plus one desktop send cannot establish Android/iOS delivery, anti-abuse behavior, or safe admin rendering.  
    **Fix:** add targeted checks for burst/concurrent submissions, quota failure, no/forged Origin, browser preflight, hostile admin strings, malformed/multibyte bodies, hidden tool and memory leakage, failed `end_session`, reload/retry/dismissal, couch exclusions, ambiguous delivery, and multi-page ordering/filtering. Verify compiled desktop and mobile transports; record unavailable device checks explicitly.

To keep v1 small, I would cut:

- The contact field, until replies or private follow-up have a defined purpose.
- Raw tool output and reasoning attachments; keep previewable prose and selected roll summaries.
- Immediate star submission; use one shared modal with optional rating and Send.
- Global search, aggregate rating dashboards, and advanced admin filters; keep newest-first summaries, detail, Load more, and a documented manual deletion process.

I would retain all four entry-point categories from decision 192, with the session card opening that same form.