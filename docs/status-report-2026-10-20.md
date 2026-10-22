# Project Status Report — 2026-10-20

> **Handover document for the next working session.** Written after the
> project sat idle for ~11 weeks (last merge: PR #188 on 2026-08-03).
> Snapshot of `origin/master` @ `1b0b2a8`. Everything below was checked
> against the code on that commit, not against prose docs. Time-sensitive
> facts (dependency versions, `npm audit`) will drift — re-run the commands
> in [Appendix A](#appendix-a--commands-to-reproduce-this-report) before
> acting on them.
>
> **Ground rule still in force:** `CLAUDE.md` / `.github/copilot-instructions.md`
> require discussing an approach and getting explicit user sign-off before
> creating, modifying, or deleting code. This report is a menu, not a mandate.
>
> **Where this report and `CLAUDE.md` disagree, this report reflects the
> code.** `CLAUDE.md` is materially stale (see [§12](#12-documentation-drift)).

---

## Contents

0. [TL;DR](#0-tldr)
1. [Timeline — how we got here](#1-timeline--how-we-got-here)
2. [Health check](#2-health-check)
3. [CI / release pipeline](#3-ci--release-pipeline)
4. [Dependencies & security](#4-dependencies--security)
5. [Lint debt](#5-lint-debt)
6. [Confirmed bugs on master](#6-confirmed-bugs-on-master)
7. [Release blocker: Prima Materia tables](#7-release-blocker-prima-materia-tables)
8. [Stranded branches](#8-stranded-branches)
9. [Roadmap items from the design docs](#9-roadmap-items-from-the-design-docs)
10. [Dead code](#10-dead-code)
11. [What's live today — feature inventory](#11-whats-live-today--feature-inventory)
12. [Documentation drift](#12-documentation-drift)
13. [Codebase map & hotspots](#13-codebase-map--hotspots)
14. [Environment, config & deployment facts](#14-environment-config--deployment-facts)
15. [Decisions that need the product owner](#15-decisions-that-need-the-product-owner)
16. [Recommended plan for the next session](#16-recommended-plan-for-the-next-session)
- [Appendix A — commands to reproduce this report](#appendix-a--commands-to-reproduce-this-report)
- [Appendix B — full PR history (July 2026)](#appendix-b--full-pr-history-july-2026)

---

## 0. TL;DR

**The core is healthy; the scaffolding around it is not.**

| Area | State |
|---|---|
| Unit/integration tests | ✅ **1,583 / 1,583 pass** (106 files, ~25 s) |
| Typecheck (`tsc --noEmit`) | ✅ clean |
| Web build (`next build`) | ✅ passes, **no env vars required** |
| Standalone/native build (`NEXT_PUBLIC_STANDALONE=true next build`) | ✅ passes, static export to `out/` |
| Lint (`eslint .`) | ❌ **587 problems — 262 errors, 325 warnings** |
| `npm audit` | ⚠️ **14 advisories — 3 critical, 7 high, 4 moderate** |
| CI on pull requests | ❌ **none** — 188 PRs merged with zero automated checks |
| Native build workflow | ⚠️ exists, **has never been run** |
| Open PRs / open issues | none / none |
| `CLAUDE.md` accuracy | ❌ wrong on auth, Supabase, env vars, API routes; silent on ~10 live subsystems |

**Things a new session must know immediately:**

1. **Supabase and auth are gone** (auth/tokens deleted 2026-07-18 in `cfc64be`;
   Supabase routes 2026-07-21 in PR #64; package dropped in `4800dd7`). The app is fully local-first with optional encrypted
   cross-device sync via a Cloudflare Worker. `CLAUDE.md`'s "Auth and BYOK"
   section, its env-var list, `README.md` and `docs/getting-started.md` all
   still describe Supabase.
2. **Confirmed bug: automatic compaction and reflection never run with default
   settings — on every platform.** Their requests omit `mistralKey`, but their
   default model is Mistral Small 3.2, so the proxy returns `NO_API_KEY` and the
   error is swallowed. Long campaigns lose old history with no recap. See
   [§6.13](#613-compaction-and-reflection-silently-fail-with-default-settings).
3. **Confirmed bug: in the native (Tauri/Capacitor) builds, most AI side calls
   silently never run.** Observer, Memory Keeper, Reflection, Compaction,
   Director Assistant and Story Progress Observer — and the creator's Designer
   chat — call `fetch("/api/generate")` directly, but the static export has no
   API routes. Turns still complete, but no memory is ever written and the
   Designer fails. See [§6.7](#67-native-builds-most-ai-side-calls-and-the-designer-bypass-the-standalone-wrappers).
   The Tauri HTTP allowlist also lacks the TTS and sync hosts ([§6.8](#68-tauri-http-allowlist-is-missing-tts-and-sync-hosts)).
4. **Confirmed bug: GM countdown timers with `auto_advance` never tick.**
   The only auto-tick code is gated on a tool (`end_gm_thinking`) the GM can
   no longer call. Front "doom clocks" are therefore inert. See [§6.1](#61-timer-auto-advance-never-fires).
5. **Several things look live but aren't:** the GM can't end a game
   (`game_over` not offered), the Web Research toggle does nothing
   (`delegate_task` not offered), the Embeddings toggle points at deleted routes,
   the PWA service worker isn't generated under Turbopack, and Vercel analytics
   are never imported. See [§6.9–6.11](#69-embeddings-toggle-points-at-a-deleted-backend).
   On Google/Gemini, a stale tool filter means session zero can never end
   ([§6.14](#614-google-tool-filter-is-stale--session-zero-cant-end-on-gemini)).
6. **Release blocker:** `app/misc/primaMateria.ts` contains word tables
   transcribed verbatim from a commercial product without permission (the
   code says so itself). Must be resolved before any public release. See [§7](#7-release-blocker-prima-materia-tables).
7. **Four branches hold unmerged work.** Two are superseded (abandon); two
   contain things worth salvaging by hand (a lint ratchet + real React bug
   fixes; and a `take_rest` removal that needs a product call). See [§8](#8-stranded-branches).
8. **Two critical advisories ship to production** (`next`, Capacitor) and both
   clear with in-range minor bumps.
9. **Online multiplayer sends the host's full `StoryData` (GM secrets, campaign
   plan) to every guest,** and guests can't answer `ask_question`. See [§6.12](#612-multiplayer-guests-get-the-full-unredacted-storydata-and-cant-answer-gm-questions).

**Suggested order of work** (detail in [§16](#16-recommended-plan-for-the-next-session)):
security bumps → PR CI with a lint ratchet → one shared side-call helper
(fixes compaction/reflection keys and native side calls) + Tauri allowlist →
Google tool filter → timer bug → React render bugs → refresh `CLAUDE.md`/README →
dead-code sweep → product decisions (`take_rest`, Prima Materia, PWA,
unreachable tools) → multiplayer redaction → roadmap features.

---

## 1. Timeline — how we got here

| Period | Activity |
|---|---|
| **2025-11-13** | Repo created (`create-next-app`), DeepSeek-backed story engine added the same day. |
| **Nov–Dec 2025** | ~490 commits, almost all **direct to `master`** (no PR workflow). Built the original "video-game stat block" design: RPG-system picker, structured stats/inventory/conditions/XP, Supabase auth + DB, coin economy, Stripe. Late Dec started deprecating parts of it (rpgSystem, AGMT thread tracking). |
| **Jan–Jun 2026** | **No commits at all.** |
| **2026-07-18 → 07-30** | ~500 commits in **PRs #1–#187**, each from a `claude/*` branch, merged by the owner — an extremely dense 13-day sprint that rebuilt most of the app (milestones below). |
| **2026-08-03** | PR #188 — Prima Materia oracle (`roll_portent`). **Last activity.** |
| **2026-08-03 → 10-20** | Idle (~11 weeks). |

**Key milestones of the July sprint** (PR numbers):

- **Jul 18** — Reasoning-tier model router; Stripe purchase layer removed (#1). GM context/tool architecture overhaul + live progress UI (#2).
- **Jul 19–20** — "Game-feel" systems removed, menu refactored toward the TTRPG/notes model (#19). Five-layer AI-GM integration plan (#20). Structured inventory deprecated (#22). Conditions, achievements and the XP economy removed → Story Threads + Goals (#29). `CLAUDE.md` added (#34). BYOK landing page (#38).
- **Jul 21** — GM sub-agent delegation `delegate_task` (#45). Serverless P2P multiplayer transport, Trystero + PeerJS (#46). 3D dice spike (#61). **Full-local pivot: Supabase routes + auth removed (#64).** Cartesia/ElevenLabs TTS (#75).
- **Jul 22** — `ask_question` GM tool (#81). Layer-5 observer that resets bad GM turns (#82). De-AI-ify vocabulary pass (#84). Memory agent (#86). Settings → Architecture tab (#88). Director Assistant spotlight tracking (#89). Periodic Story Progress Observer (#102).
- **Jul 23** — **No-auth, encrypted cross-device sync** via Cloudflare Worker + KV, then per-item merge, notes library sync, key-reset self-heal (#116, #117, #119, #122, #124, #128, #131, #132). Full-screen game-menu views (#125).
- **Jul 24** — Multiplayer wire protocol: batching, streaming, TTS relay, floor control (#136). GM plan notes / campaign spine (#137, #139, #141). Session zero at top reasoning tier + `start_game` (#148). Phase 5 "situations over plots" design — Fronts (#150). `generate_name` (#154). Observer scoped + player undo (#155).
- **Jul 25–26** — Whole-turn cost pricing (#159). Oracle/table push (#163). Campaign plan required before play (#164). **Dice tools report, never judge** — verdicts move to `calculate` (#165).
- **Jul 27** — **Conversational Game Designer replaces the 12-step creator** (#170). OpenRouter catalog refresh (#171). Dice tray hold/flick/colour (#172). OCR importer redesign + streaming notes (#173–#177). **Coins fully removed** (#175). Oracle no longer says yes to everything (#179).
- **Jul 28–30** — **Random tables become `type: "table"` notes; `gm_roll` behind the screen** (#180). Observer no longer blocks the turn (#181). Library: folders as the way in (#182). Leaked tool-call markup recovery for GLM/DeepSeek (#183–#185). OCR writes table notes (#186, #187).
- **Aug 3** — Prima Materia second oracle (#188).

Full PR list: [Appendix B](#appendix-b--full-pr-history-july-2026).

---

## 2. Health check

Run on 2026-10-20 in a fresh container (Node 22.22.0, npm 10.9.4).

| Check | Command | Result |
|---|---|---|
| Install | `npm ci` | ✅ OK. Only deprecation warnings (`inflight`, `glob@7`, `source-map@0.8.0-beta`, `sourcemap-codec`). `postinstall` runs `scripts/patchDiceBox.mjs`. |
| Tests | `npx vitest run` | ✅ **106 files, 1,583 tests, all pass**, 25 s. |
| Typecheck | `npx tsc --noEmit` | ✅ clean, ~32 s. |
| Web build | `npm run build` | ✅ "Compiled successfully", 20/20 static pages. Needs **no** env vars (Supabase vars are no longer read anywhere). |
| Standalone build | `NEXT_PUBLIC_STANDALONE=true npm run build` | ✅ static export to `out/` (what Tauri/Capacitor package). |
| Lint | `npx eslint .` | ❌ **262 errors, 325 warnings** (exit 1). See [§5](#5-lint-debt). |
| Audit | `npm audit` | ⚠️ 14 advisories (3 critical / 7 high / 4 moderate). See [§4](#4-dependencies--security). |

Note: Next 16 no longer runs ESLint during `next build`, and nothing else runs
it — which is how lint debt accumulated unobserved.

**Test suite composition** (108 files in `tests/`, ~29k lines; prefixes):
`gmTools.*` (16), `generation.*` (5), `mythic.*` (4), `aiStaged.*` (4),
`turnTimeline.*` (3), `toolExecution.*` (3), `rpgSystems.*` (3), then 1–2 each
for multiplayer, reasoningTiers, campaignPlan, compaction, lore, TTS,
providerCall, primaMateria, storyProgressObserver, syncManager, tableNotes,
reflection, searchNotes, OCR (`ocrSummarizeStream`, `pdfImageStrip`,
`textImportChunks`, `partialNotes`), turnCost, etc. There is one scenario-level
regression test (`tests/generation.campaignRegression.test.ts`); there is **no**
eval harness against real model output (see Frontier 5 in [§9](#9-roadmap-items-from-the-design-docs)).

---

## 3. CI / release pipeline

**Only one repo workflow exists: `.github/workflows/build-apps.yml`.**

- **Triggers:** `workflow_dispatch` and pushes of tags matching `v*.*.*`.
  **Not** `pull_request` or `push` to branches.
- **Run history: zero runs, ever.** It has never been exercised.
- **Jobs:**
  - `test` — `npm ci`, `npx tsc --noEmit`, `npm run test` (no lint).
  - `tauri` (needs `test`) — matrix ubuntu-22.04 / windows-latest /
    macos-latest (`--target universal-apple-darwin`); installs webkit2gtk etc.
    on Linux; Rust stable + `Swatinem/rust-cache`; `npx tauri build`; uploads
    bundles. **Unsigned** — signing env vars are commented out
    (`TAURI_SIGNING_PRIVATE_KEY*`, `APPLE_CERTIFICATE*`, `WINDOWS_CERTIFICATE*`).
  - `android` (needs `test`) — Java 21, `NEXT_PUBLIC_STANDALONE=true npm run build`,
    `npx cap sync android`, `./gradlew assembleDebug` → **unsigned debug APK**.
  - `ios` (needs `test`) — standalone build, `npx cap sync ios`, `xcodebuild …
    -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO` → **simulator-only** build.
  - `release` (tag pushes only) — collects artifacts into a **draft** GitHub
    Release.
- GitHub also lists two GitHub-managed dynamic workflows: "Copilot" (PR
  reviewer) and "Copilot cloud agent". They are not repo-defined checks.

**Consequence:** none of the 188 July PRs had automated verification. The
suite happens to be green today, but nothing guarantees it.

**Gap to close:** a `ci.yml` on `pull_request` + `push: [master]` running
`npm ci`, `tsc --noEmit`, `vitest run`, and a lint ratchet (see [§8.1](#81-claudeoracle-table-roll-usage-lre0vl--lint-ratchet--react-fixes--salvage)).
Optionally a `next build` step. Keep `build-apps.yml` for releases, and do one
manual `workflow_dispatch` run to find out whether the native builds actually
work.

---

## 4. Dependencies & security

### 4.1 `npm audit` (2026-10-20)

14 advisories: **3 critical, 7 high, 4 moderate** (npm reports the same
14 with `--omit=dev`). The table groups them by root package.

| Severity | Package | Direct? | Advisory (short) | Fix |
|---|---|---|---|---|
| critical | `next` 16.2.10 | yes | Middleware/Proxy bypass in App Router w/ Turbopack + single locale; plus a DoS advisory | in-range → **16.4.2**. Exposure is low: the repo has **no `middleware.ts` / `proxy.ts`**. Bump anyway. |
| critical | `@capacitor/android`, `@capacitor/ios` 8.4.2 | yes | Remote content can be loaded at the app origin via the internal HTTP proxy path | in-range → **8.5.3** (bump `@capacitor/core`/`cli` together). Relevant because `capacitor.config.ts` enables `CapacitorHttp`. |
| high | `@ducanh2912/next-pwa` (→ `workbox-build`, `@rollup/plugin-terser`, `serialize-javascript`, `fast-glob`, `micromatch`, `braces`) | yes | RCE in `serialize-javascript`, ReDoS/stack exhaustion in globbing | npm's only "fix" is a **downgrade** to 6.1.0 (labelled major) — **don't accept it.** Build-time only. Evaluate replacing next-pwa (e.g. with Serwist, its maintained successor — unverified fit) as a separate task. |
| high | `eslint-config-next` / `@next/eslint-plugin-next` / `typescript-eslint` family | yes/no | via `fast-glob` etc. | `typescript-eslint` chain: `npm audit fix`. npm suggests downgrading `eslint-config-next` to 14.x — **ignore**; bump to 16.4.2 instead. |
| high | `sharp` | no | libvips/libheif/librsvg CVEs | `npm audit fix` |
| high | `tar`, `source-map-js`, `@xmldom/xmldom`, `brace-expansion`, `browserslist`, `fast-uri`, `ip-address`, `js-yaml`, `nanoid` | no | DoS / injection classes | `npm audit fix` |
| moderate | `vitest` / `@vitest/mocker` | yes | path traversal via redirect mock (dev only) | → 4.1.12 |
| moderate | `postcss`, `baseline-browser-mapping`, `@humanfs/node` | mixed | | `npm audit fix` |
| moderate | `@tailwindcss/typography` → `postcss-selector-parser` | yes | quadratic parse | npm suggests a downgrade to 0.5.4 — **ignore**; take 0.5.20. |

**Recommended action:** `npm audit fix` (no `--force`), then explicitly bump
`next` + `eslint-config-next` to 16.4.2 and the four `@capacitor/*` packages
to 8.5.3; re-run tests, tsc, both builds; re-audit and record what remains
(expected: the next-pwa chain).

### 4.2 Outdated packages (in-range updates available)

| Package | Current | Wanted | Latest |
|---|---|---|---|
| next / eslint-config-next | 16.2.10 | 16.4.2 | 16.4.2 |
| @capacitor/* (android, cli, core, ios) | 8.4.2 | 8.5.3 | 8.5.3 |
| @tauri-apps/api / cli / plugin-http | 2.11.1 / 2.11.4 / 2.5.9 | 2.12.4 / 2.12.3 / 2.8.3 | same |
| tailwindcss / @tailwindcss/postcss | 4.1.17 | 4.3.3 | 4.3.3 |
| @tailwindcss/typography | 0.5.19 | 0.5.20 | 0.5.20 |
| vitest | 4.1.10 | 4.1.12 | 5.0.5 |
| trystero / @trystero-p2p/* | 0.25.3 | 0.25.4 | 0.26.0 |
| @types/react, @types/react-dom | 19.2.x | 19.3.0 | 19.3.0 |
| compressorjs | 1.2.1 | 1.4.0 | 1.4.0 |
| fake-indexeddb | 6.2.5 | 6.2.6 | 6.2.6 |
| baseline-browser-mapping | 2.10.43 | 2.11.30 | 2.11.30 |
| react / react-dom | **19.2.0 (pinned exact)** | 19.2.0 | 19.3.1 |

**Major upgrades available — not urgent, each is its own task:** TypeScript
**7.0** (the Go-native compiler; check `tsc` + Next compatibility first),
Vitest 5, ESLint 10 (wait for `eslint-config-next` support), framer-motion 14,
lucide-react 1.x, `@vercel/analytics` 2 / `@vercel/speed-insights` 2,
Trystero 0.26 (0.x minor — treat as breaking; multiplayer transports depend on it).

---

## 5. Lint debt

`npx eslint .` → **587 problems: 262 errors, 325 warnings**; 21 errors are
autofixable.

**By rule:**

| Count | Severity | Rule |
|---|---|---|
| 298 | warning | `@typescript-eslint/no-unused-vars` |
| 203 | error | `@typescript-eslint/no-explicit-any` |
| 21 | error | `prefer-const` (autofixable) |
| 15 | warning | `react-hooks/exhaustive-deps` |
| 11 | warning | `@next/next/no-img-element` |
| 8 | error | `react/no-unescaped-entities` |
| 2 | error | `@typescript-eslint/no-require-imports` |
| 1 | error | `react-hooks/rules-of-hooks` — `app/components/PDFImporter.tsx:4191` (`useSavedImport` is a plain click handler named like a hook) |
| 1 | warning | `import/no-anonymous-default-export` |

(The branch audit also saw `react-hooks/purity` errors in `goals.tsx`,
`NPCReactionToast.tsx` and `SkillTreeEditor.tsx` — real bugs, see [§6](#6-confirmed-bugs-on-master).)

**By area:**

| Area | Errors | Warnings |
|---|---|---|
| `app/misc` | 108 | 44 |
| `app/story` | 47 | 226 |
| `app/components` | 26 | 28 |
| `app/api` | 6 | 0 |
| `app/creator` | 1 | 0 |
| `app/library` | 0 | 1 |
| `tests` | 72 | 25 |
| `scripts` | 2 | 0 |
| `sync-worker/src` | 0 | 1 |

**Files with the most errors:** `app/misc/providerCall.ts` (23),
`app/misc/generation.ts` (20), `app/misc/ocrSummarizeCall.ts` (14),
`app/story/page.tsx` (13), `tests/gmTools.reactionCheck.test.ts` (11),
`app/misc/logger.ts` (9).

**`react-hooks/exhaustive-deps` sites** (each worth a look, some may be
intentional): `AIConfigTab.tsx:291` (×2), `CharacterSheetTemplateEditor.tsx:39`,
`MassLoreImageGenerator.tsx:219`, `NotificationContainer.tsx:50`,
`STTButton.tsx:118`, `SkillTreeEditor.tsx:162`, `TTSControls.tsx:842`,
`library/NotesLibraryTab.tsx:149`, `misc/NotificationContext.tsx:88`,
`story/NPCReactionToast.tsx:35`, `story/npcs.tsx:117` (×2),
`story/page.tsx:1356`, `story/story.tsx:1086`.

**Strategy:** don't try to zero it in one go. (1) Fix the handful that are real
bugs. (2) `eslint --fix` for `prefer-const` + mechanical unused-import removal.
(3) Install a ratchet so the count can only go down. (4) Pay down `any` when
touching a file.

---

## 6. Confirmed bugs on master

Ranked by severity (sections below are numbered in the order they were found):

| # | Bug | Severity | Effort |
|---|---|---|---|
| 6.13 | Compaction + reflection send no Mistral key → silently never run with defaults | **High** (all platforms) | Small |
| 6.7 | Native builds skip side calls; Designer broken there | **High** (native) | Small–medium |
| 6.1 | Timer `auto_advance` never fires | **Medium-high** | Small–medium |
| 6.12 | Guests receive GM secrets; can't answer `ask_question` | Medium | Medium |
| 6.8 | Tauri allowlist missing TTS + sync | Medium (desktop) | Small |
| 6.14 | Google tool filter stale: no `start_game`, strips Designer tools, forces `required` | Medium (Gemini users) | Small |
| 6.2 | `linkedTimerId` never written (Fronts unlinked) | Medium | Small |
| 6.10 | `game_over` / `delegate_task` unreachable; prompt references uncallable tools | Medium | Small (decide) |
| 6.11 | PWA inactive; manifest icons missing | Low–medium | Small (decide) |
| 6.9 | Embeddings toggle → deleted backend | Low | Small |
| 6.3 | `goals.tsx` mutates StoryData in render, random keys | Low–medium | Trivial |
| 6.4 | `NPCReactionToast` unstable key | Low | Trivial |
| 6.5 | `useSavedImport` hook-named handler | Low | Trivial |
| 6.6 | CLAUDE.md advertises `resolve_challenge` | Docs | Trivial |

> **Update 2026-10-22:** four more bugs turned up while reviewing a rulebook
> for the GM (decision 65). They are §6.15–6.18, after 6.14:
>
> | # | Bug | Severity | Effort |
> |---|---|---|---|
> | 6.16 | Hidden note text reaches the narrator: the stripper is never called | Medium | Small |
> | 6.15 | Rules notes are titles only, though prompts, comments and docs say pinned; `alwaysOn` and keyword triggers do nothing | Medium (confusing) | Small (decide) |
> | 6.17 | `calculate` strips letters and commas: `min(12,10)` evaluates as 1210 | Medium | Small |
> | 6.18 | `search_notes` ignores `enabled`, returning disabled notes | Low | Trivial |
>
> And three more from the token-cost measurements the same day
> ([`token-savings-design.md`](token-savings-design.md)), §6.19–6.21:
>
> | # | Bug | Severity | Effort |
> |---|---|---|---|
> | 6.19 | A turn whose GM rounds write only `<thinking>` saves an empty story, with no narrator fallback | Medium | Small |
> | 6.20 | Story that has left the history window but is under the 1,500-token summary batch is in neither | Medium (continuity) | Fixed by the token-savings design |
> | 6.21 | Memory trimming shifts entries off the front while reflection tracks progress by index | Low (the trim rarely fires) | Small |
>
> And one found while planning the token-savings build (§6.22):
>
> | # | Bug | Severity | Effort |
> |---|---|---|---|
> | 6.22 | `story_instructions` notes never reach the narrator: the GM sees their titles among the lore, the narrator nothing | Medium (a setting that does nothing) | Small (decide) |

### 6.1 Timer auto-advance never fires

**Severity: medium-high (silent gameplay bug).** Verified directly.

- `manage_timer`'s schema (`app/misc/gmTools.ts:2181`) tells the model:
  *"If auto_advance is true (default), it ticks down each GM turn."*
- The only code that auto-decrements timers is `app/misc/gmExecutor.ts:1444-1472`,
  gated on `if (isComplete && …)`.
- `isComplete` is set in exactly one place: `gmExecutor.ts:1434-1435`, when
  `res.toolName === "end_gm_thinking"`.
- `end_gm_thinking` is a leftover from the pre-tool-calling architecture and is
  **not in the GM-stage tool whitelist** (`buildGMStagePrompt` in
  `app/misc/ai_staged.ts`) — the model cannot call it.
- No other code decrements `currentTicks` except explicit `manage_timer`
  `advance` (`gmExecutor.ts:~5044`) and `trigger` (`~5244`).
- **Effect:** every auto-advance timer, including Phase 5 Front "doom clocks",
  stays frozen unless the GM manually advances it. The model is told the
  opposite.
- **Fix sketch:** tick `autoAdvance` timers once per turn at the real end of
  the GM loop in `app/misc/generation.ts` (where the GM stage exits), surface
  the tick/trigger lines into the story-stage context, add a test, and then
  delete `end_gm_thinking` end to end (see [§10](#10-dead-code)). Check undo/retry
  snapshotting covers the timer mutation.

### 6.2 `StoryThread.linkedTimerId` / `threshold` are never written

**Severity: medium (feature never actually connected).** From the branch
audit; re-verify before fixing.

- `create_thread` / `update_thread` only accept title/description/priority;
  `manage_timer` has no thread parameter.
- So the director's `tick_a_clock` `targetThreadId` lookup (`app/misc/mythic.ts:~665`)
  and the linked-thread surfacing in `gmExecutor.ts:~5059` never match.
- Phase 5 defines a Front as "a thread whose `linkedTimerId` points at its
  clock" — in practice the link only exists by naming convention.
- **Fix sketch:** add an optional `thread_id` to `manage_timer` create (or a
  `timer_id` to `create_thread`/`update_thread`) and write both sides.

### 6.3 `goals.tsx` mutates StoryData during render + random keys

- `app/story/goals.tsx:80` assigns `goal.id = \`goal-${Math.random()}\`` during
  render — mutates the caller's `StoryData`, non-deterministic.
- Random `key` props at `:84`, `:152`, `:225` — every render remounts each row.
- Component is live (`app/story/page.tsx:62`, `:5122`).
- Fix: key on `goal.id ?? index`; never assign ids during render (assign at
  creation in the executor if missing).

### 6.4 `NPCReactionToast` unstable key

- `app/story/NPCReactionToast.tsx:136` uses a `Date.now()`-based key, which
  restarts each toast's dismiss animation on every parent render. Live via
  `page.tsx:122`, `:5268`.

### 6.5 `PDFImporter` `useSavedImport` naming

- `app/components/PDFImporter.tsx:1393` defines `useSavedImport`, an ordinary
  click handler, called at `:4191`. Trips `rules-of-hooks` (the only such error)
  and misleads readers. Rename to `applySavedImport`.

### 6.6 Docs bug: `resolve_challenge` advertised as live

- `CLAUDE.md` lists `start_challenge / record_challenge_result / resolve_challenge / cancel_challenge`.
  `resolve_challenge` (and `update_challenge`) only exist in the unreachable
  "challenge system B" in `toolSchemas.ts`/`toolExecutor.ts` — see [§10](#10-dead-code).

### 6.7 Native builds: most AI side calls and the Designer bypass the standalone wrappers

**Severity: high for the native apps** (commit `2a75ccb`'s message describes
the Tauri/Capacitor apps as the real target and Vercel as a testing
deployment). Verified by grep.

The standalone (static-export) build has **no `/api/*` routes**; code must go
through `providerFetch` (`app/misc/providerFetch.ts`), which calls the provider
in-process when `isStandalone()`. These modules still call
`fetch("/api/generate")` directly:

- `app/misc/observer.ts` (6 call sites: ~l.943, 1039, 1162, 1313, 1502, 1667)
- `app/misc/memoryAgent.ts:111`
- `app/misc/reflection.ts:148`
- `app/misc/compaction.ts:312`
- `app/misc/directorAssistant.ts:101`
- `app/misc/storyProgressObserver.ts:320`
- `app/misc/subagentExecutor.ts:152` (only reachable via `delegate_task`, itself unreachable)
- `app/creator/useDesignerSession.ts:293` — **the Designer chat**

They were all added after the standalone port (`8de78ac` rewired only
`generation.ts`). Effects in native builds: these all fail open, so turns still
complete — but **Observer, Memory Keeper, Reflection, Compaction, Director
Assistant and Story Progress Observer silently never run**; since the Memory
Keeper is the only memory writer, **no memory is ever written**; and the
**creator's Designer chat should fail outright.** (`ocrSummarizeStream.ts` also
has a raw fetch but guards it with `isStandalone()`, so it's fine.)

**Fix sketch:** route every one through `providerFetch` (or a shared
`callModel()` helper), add a test that greps/asserts no `fetch("/api/` outside
the `*Fetch.ts` wrappers, and smoke-test a standalone build.

### 6.8 Tauri HTTP allowlist is missing TTS and sync hosts

`src-tauri/capabilities/default.json` allows only `api.deepseek.com`,
`openrouter.ai`, `api.mistral.ai`, `api.deepinfra.com`,
`generativelanguage.googleapis.com`, `api.search.brave.com`. But `ttsCall.ts:380`
(Cartesia `api.cartesia.ai`, ElevenLabs `api.elevenlabs.io`) and
`syncManager.ts:266` (the sync worker URL) both use `getProviderFetch()`, which is
Tauri's scoped plugin fetch on desktop — so **TTS and sync will very likely be
rejected on the desktop app**. Not run-tested. Capacitor has no allowlist.
Fix: add the TTS hosts and the sync worker origin (it's a build-time
`NEXT_PUBLIC_SYNC_API_URL`, so either a wildcard for `*.workers.dev` / the custom
domain or generate the capability at build time).

### 6.9 Embeddings toggle points at a deleted backend

Settings → AI Config still offers **"Enable Embeddings"** (`embeddingsEnabled`,
`embeddingThreshold`). `app/misc/embeddings.ts` calls `/api/embeddings/{generate,
search,upsert,keys,cleanup}` — those routes were deleted in `3348a4a` (PR #64).
Turning it on makes `search_notes`/`search_memory` append "[Semantic search
unavailable right now …]" and the post-turn memory sync fail quietly. Fix: remove
the toggle and the dead client (or rebuild embeddings BYOK-side), along with
`semanticSearchFallback.ts`.

### 6.10 Unreachable GM tools with live-looking UI or prompt references

See the full list in [§11.3](#113-gm-tool-catalogue). The user-visible consequences:

- **`game_over` is never offered** — the GM has no way to end a game (the
  executor, with a "downed player" gate at `toolExecutor.ts:~2215`, is intact).
- **`delegate_task` is never offered** — so Settings' **Web Research toggle and
  Brave Search key do nothing**, and `subagentExecutor.ts` + `/api/web-search`
  are dead.
- The GM prompt still instructs the model to call **`request_continuation`**
  (`ai_staged.ts:1537`), which it can't; `roll_table`'s description mentions
  **`reaction_check`**, also not offered. Either re-offer them or delete the
  references.
- `reaction_check` and `negotiate_price` have tests and struct support but are
  not offered — decide whether they come back.

### 6.11 PWA layer is inactive

`next.config.ts` wraps the config with `@ducanh2912/next-pwa`, a **webpack**
plugin, but Next 16 builds with **Turbopack** — after both production builds on
2026-10-20 there is **no `public/sw.js`**. `public/manifest.json` also points at
`/icon-192x192.png`, `/icon-384x384.png`, `/icon-512x512.png`, which **don't
exist** in `public/`. So the "installable/offline" PWA promised by
`docs/pwa-setup.md` isn't working, while the dependency still contributes most of
the `npm audit` high-severity chain ([§4.1](#41-npm-audit-2026-10-20)). Fix: either drop
next-pwa (and the manifest) or migrate to a Turbopack-compatible solution, and
generate the icons (`generate-icons.sh` exists at the repo root).

### 6.12 Multiplayer: guests get the full, unredacted StoryData and can't answer GM questions

- `NetSession.broadcastSnapshot()` (`app/misc/multiplayer/session.ts:~440`) sends
  the host's entire `StoryData` in every `state_snapshot` — **including secrets,
  `to_be_revealed` lore and `gm_plan` notes**. Guests' UIs may not show them, but
  anyone with devtools can read the GM's plan. A spoiler/cheating issue rather
  than a security one (games are among friends), but worth a redaction pass.
- No wire message relays **`ask_question`** or **`ask_for_roll`** (no
  `ask_question` reference anywhere in `app/misc/multiplayer/`), so these modals
  only appear on the host — **online guests can't answer GM questions** or
  respond to manual roll requests themselves.
- Invite links are built from `window.location.origin`; from a native build that
  origin isn't a shareable web URL, so links copied inside the apps likely won't
  open for others (inference, untested).
- `story_delta` is defined in `types.ts` but never sent or handled.

### 6.13 Compaction and reflection silently fail with default settings

**Severity: high (affects every long campaign, web and native).** Verified.

- `callSummarizeApi` (`app/misc/compaction.ts:~308-330`) and `callReflectionApi`
  (`app/misc/reflection.ts:~144-166`) send only `openRouterKey`, `deepseekKey`
  and `googleKey` — **not `mistralKey` or `deepinfraKey`**.
- Both are called with `model: options.storyModel || gmModel`
  (`generation.ts:~2117`, `~2156`), and `storyModel` defaults to
  `NARRATION_MODEL_KEY` = **"Mistral Small 3.2"**, whose provider is `mistral`
  (`ai_prices.ts:~270`). The proxy picks `body.mistralKey` for that provider
  (`providerCall.ts:298`) → missing → `NO_API_KEY`.
- Both treat a non-OK response as "no result" (`if (!response.ok) return null`),
  so the failure is swallowed.
- **Effect:** with default settings, **automatic compaction never writes a
  scene summary and reflection never produces insights** — old history ages out
  of the context budget with no recap. Combined with [§6.7](#67-native-builds-most-ai-side-calls-and-the-designer-bypass-the-standalone-wrappers),
  long campaigns lose continuity everywhere.
- **Fix:** forward all five keys (better: one shared side-call helper that
  always forwards the full key set and goes through `providerFetch`), and log
  side-call failures to the Debug Logs instead of swallowing them.

> **Update 2026-10-21:** fixed by PR #191 (`callSideModel()`). A second bug of
> the same family turned up afterwards. The Observer, Memory Keeper, Director
> Assistant and Story Progress Observer were given `GenerationMeta.model`, the
> provider's own model id. The proxy cannot resolve that id
> (`getModelConfig()` only knows `AI_MODELS` keys), so it fell back to
> DeepSeek V4 Flash, and a player without a DeepSeek key got `NO_API_KEY` from
> every one of them. Unpinned side agents, compaction and reflection now all
> run on the narration model, override included (decision 19);
> `tests/generation.sideCallModel.test.ts` covers it.

### 6.14 Google tool filter is stale — session zero can't end on Gemini

**Severity: medium (Google/Gemini users only).** Verified.

- `GOOGLE_ESSENTIAL_TOOLS` (`app/misc/providerCall.ts:129-158`) is a hard-coded
  allowlist of 19 tools that predates most of July: it still contains
  `add_memory` and `end_gm_thinking` (neither offered any more) and **lacks
  `start_game`, `advance_plan`, `ask_question`, `increment_scene`,
  `acknowledge_director_move`, `resolve_random_event`, `gm_roll`, `roll_table`,
  `manage_timer`, the thread/goal tools, `roll_portent`…**
- Consequences on a Google model: **`start_game` is never sent, so session zero
  can never end**; the campaign-plan and director machinery can't be driven; and
  since it filters by name, it **strips every Game Designer tool** too.
- It also forces `tool_choice: "required"` on every Google round
  (`providerCall.ts:~566-568`), so the GM can never end its loop with plain
  prose — it relies on the round cap.
- **Fix:** derive the Google set from the live whitelist (or a tag on each
  schema), keep it in a test, and only force `required` when the caller asks.

### 6.15 Rules notes are titles only, though the prompt, comments and docs say pinned

**Severity: medium (the GM is told two things, and authors are told a third).**
Found 2026-10-22; verified in the code.

- `buildGMStagePrompt` puts `dm_instructions`, `character_sheet` and `gm_plan`
  notes in full in every round, and lists `mechanics` notes **by title only**
  (`app/misc/ai_staged.ts:1208-1213`). The GM has to call `read_notes` to see
  the rules; the prompt says so at line 1555. That has been the behaviour
  since at least July 2026.
- Everything else says the opposite. The comments at `ai_staged.ts:448` and
  `:1093-1095` and `:1115` call `mechanics` pinned and "always loaded in
  full"; **the GM's own NOTE TYPES table** (`ai_staged.ts:1680`) tells the
  model the same, contradicting line 1555 of the same prompt; so does the
  `LoreType` comment (`app/misc/structs.ts:176`) and `CLAUDE.md`.
- **`alwaysOn` and keyword triggers do not change what the GM sees.**
  Nothing in `ai_staged.ts`, `gmExecutor.ts` or `generation.ts` reads
  `alwaysOn`, `on` or `on_triggers`; `processLoreTriggers` (`app/misc/lore.ts`)
  sets `on`, which only search ranking reads. The Designer's tool schema
  still tells it `alwaysOn` means "always in the GM's context" and that
  `keys` "pull this note into context" (`app/misc/designer_tools.ts:158-163`),
  and `designer_executor.ts:282-286` forces `alwaysOn` on rules notes for
  that reason. The PDF importer marks every rules note `alwaysOn` too
  (`app/misc/ocrSummarizeCall.ts:1178`).
- **There is no size cap anywhere.** The pinned notes are never truncated
  (the 40% "info budget" is only logged, `ai_staged.ts:2229-2231`), and
  `read_notes` returns a note whole. So a book-length note is either tens of
  thousands of tokens in every round (pinned types) or in one tool result
  (`mechanics`).
- **Fix:** decide which behaviour is meant. Decision 72 keeps titles-only for
  rules notes (a system's core goes in a pinned note); then correct the NOTE
  TYPES table, the comments, the `LoreType` comment and the Designer's
  `alwaysOn`/`keys` descriptions to match.

### 6.16 Hidden note text reaches the narrator: the stripper is never called

**Severity: medium (a secret-keeping guarantee that isn't there).** Found
2026-10-22; verified in the code, not in a played turn.

- `read_notes` wraps `hidden`, `to_be_revealed` and `check_per_turn` content
  in `[[HIDDEN_LORE]]` markers, with a comment promising that
  `stripHiddenLoreContent()` "removes everything between these markers before
  the Narrator stage ever sees it" (`app/misc/gmExecutor.ts:3214-3232`).
- `stripHiddenLoreContent` (`app/misc/ai_staged.ts:57`) is defined and
  unit-tested (`tests/twoPassVisibility.test.ts`) but **has no caller**.
- When the narrator continues the turn, its messages are the GM's base
  messages plus the GM's whole conversation, tool results included
  (`app/misc/generation.ts:3009`, `:3140-3145`). So the hidden text reaches
  the narrator model, guarded only by the "do not narrate" line inside it.
  `search_notes` also includes hidden notes by default
  (`app/misc/toolExecutor.ts:1875`), as excerpts.
- `docs/research-paper-ttrpg-theory-gap-analysis.md` describes the stripper as
  working.
- **Fix:** strip the markers' contents from the GM conversation before it is
  handed to the story stage (and decide whether `search_notes` should default
  to excluding hidden notes), with a test on the narrator's messages.

### 6.17 `calculate` strips letters and commas: `min(12,10)` evaluates as 1210

**Severity: medium (a confident wrong answer).** Found 2026-10-22; verified in
the code and measured.

- `evaluateArithmetic` removes everything but digits, `+ - * / ( ) .` and
  spaces before evaluating (`app/misc/gmExecutor.ts:1666`). So
  `min(12,10) >= 7` becomes `(1210) >= 7` and comes back
  **"1210 >= 7 → TRUE"**; `min(5+6,10)` gives 615. With a space,
  `min(12, 10)` becomes `(12 10)` and errors.
- The tool has no functions, and one comparison per call
  (`splitComparison`, `gmExecutor.ts:1617-1640`). Systems with a capped
  score (Ironsworn's action score caps at 10) can't express the cap, and a
  model that tries `min()` gets a wrong number instead of an error.
- **Fix:** reject any letter or comma with an error that names what is
  supported (or support `min`/`max` explicitly), with tests for both.

### 6.18 `search_notes` ignores `enabled`

**Severity: low.** Found 2026-10-22; verified in the code.

- `search_notes` skips notes with `on === false` but never checks `enabled`
  (`app/misc/toolExecutor.ts:392-399`), so excerpts of disabled notes come
  back, while `read_notes` refuses the same notes (`gmExecutor.ts:3182-3185`).
- **Fix:** skip `enabled === false` in the search loop, with a test.

### 6.19 A thinking-only GM turn saves an empty story

**Severity: medium (a blank turn).** Found 2026-10-22; reproduced in a
measurement harness, and the path checked in the code.

- When any GM round wrote text, the accumulated text becomes the story
  (`gmFinalStoryContent`, `app/misc/generation.ts:3026-3028`) and the
  narrator is skipped (`:3064`). The text is then reduced to its
  player-visible part with `extractVisibleText` (`:3077`).
- If every round wrote only `<thinking>…</thinking>`, the check passes on
  the thinking text, the visible part is empty, and the turn is saved with
  no story and no narrator fallback.
- **Fix:** decide on the *visible* text: if `extractVisibleText` of the
  accumulated content is empty, fall through to the narrator stage, with a
  test.

### 6.20 Story that has left the window but is not yet summarised

**Severity: medium (continuity).** Found 2026-10-22; verified in the code.

- The history window keeps the most recent parts within the budget
  (`getPartsWithinTokenBudget`, `ai_staged.ts:208`). `planCompaction`
  (`app/misc/compaction.ts:207-247`) summarises the parts between the last
  summary and the window's start, but returns `null` while that stretch is
  under `MIN_UNCOVERED_TOKENS_TO_SUMMARIZE` (1,500 tokens, `:23`).
- Until it reaches 1,500 tokens, that stretch is in neither the history nor
  the summary; the same holds for as long as summarisation keeps failing.
- **Fix:** the token-savings design (decision 94) gives history a fixed
  start at the summary's end, so everything after the summary is always
  sent and nothing can fall between the two.

### 6.21 Memory trimming and reflection's index disagree

**Severity: low (the trim rarely fires).** Found 2026-10-22; read in the
code, not run.

- `updateStoryData` (`app/story/page.tsx:1695-1730`) trims memory by
  `shift()`ing entries off the front once it passes a cap of 25% of the
  model's input window (about 935k characters with the default model). It
  runs only from the lore and NPC editors.
- Reflection records its progress as an index, `memoryReflectedThroughIndex`
  (`app/misc/reflection.ts:62, 113`). A trim from the front shifts every
  entry down, so the index then points past entries that were never
  reflected on.
- **Fix:** move the index back by the number of entries trimmed (or track
  reflection by entry timestamp), with a test.

### 6.22 `story_instructions` notes never reach the narrator

**Severity: medium (a setting that does nothing).** Found 2026-10-22 while
planning the token-savings build; verified in the code.

- The type is documented as narrator guidance (`structs.ts:175`, "Story
  Stage only"; the Designer's `write_note` schema, `designer_tools.ts:134`;
  the Lore page and the inspector, which label it "Narrator style").
- No stage sends its text. The GM stage's `categorizeNotes`
  (`app/misc/ai_staged.ts:1127`) has no case for it, so it falls into the
  `lore` bucket and is listed by title for `read_notes`. The narrator
  (`buildStoryContinuationPrompt`, `:2251`) continues the GM's conversation
  and adds no notes of its own, so it sees only that title. The choices
  stage's `buildInfoMessage` excludes the type outright (`:478`) on the
  comment that the story stage uses it.
- **Fix (a product call):** either give the narrator the enabled
  `story_instructions` notes in full as part of its continuation message
  (and drop them from the GM's lore list), or retire the type and convert
  existing notes to `dm_instructions`. The token-savings plan
  ([`token-savings-implementation-plan.md`](token-savings-implementation-plan.md))
  leaves this alone.

---

## 7. Release blocker: Prima Materia tables

> **Update 2026-10-21: resolved by stripping (option 2).** The repo turned
> out to be public already. The book's tables and keyword sets were removed;
> the keywords and complication seeds were replaced with original
> placeholders, and the `pm_*` `roll_table` tables are gone. Git history
> still holds the original text. See `docs/prima-materia.md` → Provenance.

`docs/prima-materia.md` opens with **"⚠️ Provenance — this is not cleared for
public release"**: the appendix word lists in `app/misc/primaMateria.ts`
(`DISPOSITIONS`, `ACTIONS`, `LANDMARKS`, `NAMES`, `COMPLICATIONS`,
`QUEST_PROMPTS`, `QUICK_PLUCKS`, around lines 548-642) are **transcribed
verbatim from a commercial product we do not own, reproduced without
permission.** The mechanisms (frames, tint, lens shift, operators) are
original/uncopyrightable systems; the tables are the problem.

The doc lists three options: **(1) get permission** from the designer (the doc
notes they actively invite people to build with the system), **(2) strip the
tables**, or **(3) replace them with original content.** This is a product-owner
decision and must be resolved before any public deploy, app-store build, or
making the repo public. The rest of PR #188 is implemented as described
(`roll_portent` peek/pinch/portent, frames, tint + Lens Shift reaching the
narrator, portents on random events, `pm_` tables, complication seeds,
"Yes, but"/"No, but" bands); Pull/Pass was deliberately not built.

---

## 8. Stranded branches

`origin` has ~100 `claude/*` branches; all but four are fully merged into
`master`. **None of the four merges cleanly today.**

| Branch | What it holds | Verdict |
|---|---|---|
| `claude/oracle-table-roll-usage-lre0vl` (`b4fcf9b`) | Lint ratchet + React bug fixes + mechanical cleanup | **Salvage by hand** |
| `claude/remove-rest-tool-gm-kj333b` (`e5d176f`, `2f86715`) | Remove `take_rest` + dead pre-tool-calling code | **Redo fresh as two PRs** (one needs a product call) |
| `claude/ocr-timeout-large-files-jor6z0` (`2dfd251`) | Split-on-timeout for OCR chunks | **Abandon** (superseded by PR #31) |
| `claude/library-folder-export-au2ukj` (`0ff23b8`) | Always-visible folder export button | **Abandon** (superseded by PR #130) |

### 8.1 `claude/oracle-table-roll-usage-lre0vl` — lint ratchet + React fixes → salvage

Pushed at 15:32 UTC on Jul 25, **after** its PR #163 had merged at 11:20 — so
it was silently stranded. Touches 40 files (+184/−342).

Claimed fixes vs master today:

| Claimed fix | Status on master |
|---|---|
| `AdventureVisualization` `useMemo` after early return | Moot — file deleted with the old creator (`d91278c`). |
| `goals.tsx` random keys + `goal.id` mutation | **Still a bug** — [§6.3](#63-goalstsx-mutates-storydata-during-render--random-keys). |
| `NPCReactionToast` `Date.now()` key | **Still a bug** — [§6.4](#64-npcreactiontoast-unstable-key). |
| `PDFImporter` `useSavedImport` → `applySavedImport` | **Still open** — [§6.5](#65-pdfimporter-usesavedimport-naming). |
| `CustomTablesEditor` suppression | Moot — file deleted (tables became notes, `0598470`). |
| `SkillTreeEditor` suppression | File still exists with `Math.random` purity errors (`:161-162`), but **`SkillTreeEditor`/`SkillTreeView` are imported nowhere** — delete instead. |

**The ratchet as written:** `scripts/lint-ratchet.mjs` (89 lines) runs
`npx eslint -f json`, ignores ESLint's exit code, sums error/warning counts and
exits 1 only if either rises above `lint-baseline.json`
(`{"errors":347,"warnings":226}`); `--update` rewrites the baseline; it prints a
hint when counts drop. Wired as `"lint:ci"` in `package.json` and a step in
`build-apps.yml`'s `test` job.

**Why not merge as-is:** 10 conflicting files (6 modify/delete against files
master deleted; content conflicts in `PDFImporter.tsx`, `story/menu.tsx`,
`story/menu/LoreEditor.tsx`, `story/page.tsx`); its baseline is obsolete
(master has 325 warnings > 226, so it would fail immediately); and it was wired
into a workflow that never runs on PRs.

**Salvage plan:** cherry-pick the *idea*, not the commit — take
`lint-ratchet.mjs` (`git show b4fcf9b:scripts/lint-ratchet.mjs`), regenerate the
baseline on current master, add it to a new PR-triggered `ci.yml`; hand-apply
the goals/NPCReactionToast/PDFImporter fixes; delete SkillTree*; redo
unused-import/`prefer-const` cleanup fresh with `eslint --fix`.

### 8.2 `claude/remove-rest-tool-gm-kj333b` — redo fresh

No PR was ever opened for this branch. (The similarly named
`…-kj333b-qbicob` branch *was* merged as PR #83, but it removed different
dead code and did not touch `take_rest`.)

- **`e5d176f` — remove `take_rest` and the rest system (−662 lines).**
  `take_rest` is **fully live** on master: whitelisted (`ai_staged.ts:~1737`),
  schema `gmTools.ts:821`, executor `gmExecutor.ts:1038` → `executeTakeRest`
  `:1811`, label `gmToolLabels.ts:22`, `REST_CONFIG`/`RestConfig`
  (`structs.ts:736-749`), `StoryData.restState` (`structs.ts:1062`), resets in
  `page.tsx`, `menu.tsx`, `storyCompaction.ts`, and documented in
  `CLAUDE.md` + `docs/game-mechanics.md`. The branch's rationale still holds:
  `executeTakeRest` only restores structured `resources`, ability cooldowns and
  inventory durability — all removed or soft-deprecated systems — so on a
  modern freeform-character-sheet adventure it just increments counters.
  There's also an unreachable duplicate (`toolSchemas.ts:1128` /
  `toolExecutor.ts:2756` → `executeRestTool` `:3183`) and an unused
  `REST_CONFIG` import in `ai_staged.ts:6`. **Needs a product decision**
  ([§15](#15-decisions-that-need-the-product-owner)).
- **`2f86715` — remove dead pre-tool-calling code (−1,544 lines).** Mostly
  already landed via PR #83. **Still present and dead:** `end_gm_thinking` end
  to end — and its removal is entangled with the timer bug ([§6.1](#61-timer-auto-advance-never-fires)).
- 7 conflicting files. **Abandon the branch; redo as (a) take_rest removal
  if approved, (b) timer fix + `end_gm_thinking` removal.**

### 8.3 `claude/ocr-timeout-large-files-jor6z0` — abandon

Split a timed-out OCR page range in half and recursed. A parallel fix (PR #31,
`96c9a93`) landed the same day with a different design: `maxDuration = 300`,
`OCR_TIMEOUT_MS = 240000` (`PDFImporter.tsx:88`), timeout-vs-abort aware retry
with backoff (`:263-310`), failed chunks marked and skipped with per-chunk manual
retry (`retryChunk`, `:1412`), payload-size splitting + image stripping
(`ocrPDFRange`, `:855-958`). Master does **not** split on timeout. If timeouts on
image-heavy chunks still occur in practice, re-implement only that idea inside
`ocrPDFRange`'s `allSettled` split branch.

### 8.4 `claude/library-folder-export-au2ukj` — abandon

Made the folder-export button always visible. PR #130 already made it
`opacity-100 sm:opacity-0 sm:group-hover:opacity-100` (always visible on
mobile); after the #182 redesign it lives at `NotesLibraryTab.tsx:751-760` and
`StoriesLibraryTab.tsx:376-385`, and `FolderDetailView.tsx:251` also exposes
Export.

### 8.5 Branch hygiene

~100 merged `claude/*` / `copilot/*` branches remain on `origin`. They can be
deleted once the four above are dealt with (keep `lre0vl` and `kj333b` until
their salvage PRs land, since this report cites their commits).

---

## 9. Roadmap items from the design docs

Sources: `docs/architecture-frontier.md` (last edited Jul 22),
`docs/five-layer-architecture-changelog.md`, `docs/gm-plan-notes-design.md`.

### 9.1 The frontier doc's "If you only do three things next"

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | **`ask_question` spotlight-tracking gap** (Frontier 6) | **Not started** | `couchPlayerFocus` is written only in `page.tsx:~1946-1955` (`handleCustomInput`); `playerStyleCounts` only at `page.tsx:~1980`, `~2205`. The answer path `requestPlayerAnswer`/`resolveAskQuestion` (`page.tsx:~3419-3430`) touches neither. Low effort: the resolution path already knows which player answered. |
| 2 | **Per-chapter tension target + historical pacing sparkline** (Frontier 3) | **Not started** | `storyProgress()` (`mythic.ts:384`) is still `currentChapter / max_chapters`; `targetTensionForProgress` (`:403`) is one campaign-wide Freytag curve. No `tensionHistory`/sparkline anywhere; `ContextViewer.tsx:~1130-1144` shows only live tension + pending moves. |
| 3 | **NPC-scoped reflection** (Frontier 1, item 2) | **Not started** | `planReflection` (`reflection.ts:58`) reflects over all new memories, no `entityIds` filter. |

### 9.2 Everything else in the docs

| Item | Status |
|---|---|
| Phase 5a — prediction framing, `advance-on` triggers, Fronts (background thread + doom clock), Secrets & Clues | **Done** (in GM prompt, `ai_staged.ts:~1680-1700`) — but see bugs [§6.1](#61-timer-auto-advance-never-fires)/[§6.2](#62-storythreadlinkedtimerid--threshold-are-never-written): Front clocks don't tick and aren't linked. |
| Phase 5b — reflection tags `[Neutralized]/[Clock]/[Goal]/[Arc]`, `advance_plan` guidance | **Done** (`reflection.ts:83`, tests). The 4th planned category ("open questions the oracle should seed") was not shipped; `[Arc]` took its slot. |
| Phase 5c — typed `StoryThread.steps?`, boundary digest | **Deferred / not started** |
| Phase 7/8 — observer deferral, late rewrite, mechanics/judge-reasoning blocks | **Done** |
| Frontier 1 — NPCs as agents (`currentIntent`/`goal` on `NPC`, `add_npc_memory`) | Not started (doc says it needs explicit product-owner approval) |
| Frontier 2 item 2 — second-order reflection | Not started (doc: don't build before a demonstrated need) |
| Frontier 3 — expand director move menu | Not started (still 7 moves in `selectDirectorMove`) |
| Frontier 4 — widen `checkNarrationConsistency` to resolved/abandoned threads | Not started (`consistencyCheck.ts` still dead/departed NPCs only) |
| Frontier 5 — eval harness with imposed failure rates | Not started |
| Frontier 6 — per-PC mechanical independence | Not started (only `StoryLore.ownerCouchPlayerId`, `structs.ts:249`) |
| Frontier 6 — networked multiplayer | **Doc is stale:** host-authoritative P2P multiplayer already exists in `app/misc/multiplayer/` (Trystero + PeerJS; host owns `StoryData` and broadcasts snapshots). The "manual" signaling backend is explicitly unimplemented (`app/misc/multiplayer/transports/index.ts:6-7,17`). No doc describes the multiplayer system. |
| Frontier 8 — hybrid observational event log | Not started |
| H6 (content safety), H8 (roll-integrity residual gap) | Open **by product decision** |
| Prompt-budget cross-cutting concern | Capped (`MAX_SURFACED_REFLECTIONS = 3`, `ai_staged.ts:92`); never measured (unverified) |

No `TODO`/`FIXME`/`HACK`/`XXX` markers exist in `app/` or `tests/`; deferred
work is noted in prose instead (e.g. `localStoryManager.ts:24`: no LRU eviction,
IndexedDB manages its own quota "for now").

---

## 10. Dead code

The frontier doc flagged some of this in July; all of it is still present.
None is harmful today, but each is a trap for a future edit.

| Dead code | Where | Notes |
|---|---|---|
| `end_gm_thinking` (schema → executor → result handling → legacy branch) | `gmTools.ts:~1513`; `gmExecutor.ts:~878-919, 1141, 1434, ~3596`; `generation.ts:~2811-2840`; `gmToolLabels.ts:71`; `providerCall.ts:156` (Google allowlist); `tests/gmToolLabels.test.ts:9` | Not whitelisted. **Remove together with the timer fix** ([§6.1](#61-timer-auto-advance-never-fires)). |
| "Challenge system B": `start/update/resolve/cancel_challenge` | `toolSchemas.ts:~994/1055/1082/1107`; handlers `toolExecutor.ts:~2288/2367/2473/2542` | Live GM uses `gmTools`' start/cancel/`record_challenge_result`, handled in `gmExecutor` (`:1021`/`:1028`). No tests call B. |
| Duplicate `take_rest` | `toolSchemas.ts:1128`, `toolExecutor.ts:2756` → `executeRestTool` `:3183` | Unreachable regardless of the take_rest decision. |
| Local `AGMTState` / `createAGMTState` / `setupScene` | `mythic.ts:~1131/1141` | Shadows the real `structs.ts:1101` type. Test-only callers (`tests/oracleRecency.test.ts:20,48`, `tests/mythic.checkScene.test.ts:69,78`). |
| `parseDifficulty` | `gmExecutor.ts:673` | Zero callers anywhere. |
| `SkillTreeEditor` / `SkillTreeView` | `app/components/` | Imported nowhere. |
| Unused imports | `REST_CONFIG` in `ai_staged.ts:6`; `executeTools` in `generation.ts:98` | Part of the 298 `no-unused-vars`. |
| Components with no importers | `CharacterSheetEditor`, `CharacterSheetTemplateEditor`, `ClockCategorySelector`, `MassLoreImageGenerator`, `LocalStoryList`, `LocalAdventureList`, `IconAttribution`, `LoadingButton` (all `app/components/`) | Verified: 0 importers in `app/` or `tests/`. |
| Modules with no importers | `app/misc/adventureExport.ts`, `sample_adventures.ts`, `imageCompression.ts` | Verified. |
| Dead client for deleted routes | `app/misc/embeddings.ts`, `semanticSearchFallback.ts` | See [§6.9](#69-embeddings-toggle-points-at-a-deleted-backend). |
| Unreachable-by-model tool executors | 17 tools, see [§11.3](#113-gm-tool-catalogue) | Decide re-offer vs delete per tool. |
| Routes with no caller | `api/ocr/summarize` (non-streaming); `api/web-search` (only for unreachable `delegate_task`) | |
| Unused wire message | `story_delta` in `app/misc/multiplayer/types.ts` | |
| Unused dependencies | `@vercel/analytics`, `@vercel/speed-insights` (never imported) | Wire them in `app/layout.tsx` or drop them. |
| Stray file | `app/components/TTSControls.tsx.backup` | Delete. |
| Stale code comment | `observer.ts` says "no settings UI exists yet" | The Architecture tab exists. |
| Deprecated struct fields | `structs.ts` (11 `deprecated` markers) | Back-compat for old saves — keep, but don't build on them. |

---

## 11. What's live today — feature inventory

Built by reading the code on `1b0b2a8` ("wired" = code paths connected from
UI to engine, not observed running). Settings are localStorage keys unless
noted.

### 11.1 Turn pipeline — `app/misc/generation.ts`

- **Entry points** (`app/story/page.tsx`): `handleCustomInput` (typed/voice,
  ~l.1850), `handleChoice` / `handleChoiceWithAction` (~l.2589 / ~l.3073),
  `handleRetry` (~l.3545 — reuses the saved GM conversation, regenerates
  narration only), and the online host's batched turn.
- **`generateStoryTurn()`** (l.843) — outer wrapper: opens a cost ledger
  (`turnCost.ts`), snapshots pre-turn state, carries forward last turn's
  observer/story-progress/repetition/knowledge notes, loops
  `generateStoryTurnOnce()` with at most one observer reset
  (`MAX_OBSERVER_RESETS = 1`), runs the observer (blocking or background), then a
  **background wave**: deferred observer → Memory Keeper → Director Assistant
  (only if `increment_scene` ran) → Story Progress Observer → final cost log.
- **`generateStoryTurnOnce()`** (l.1859):
  - *Stage 0* embedding prefetch — intentionally off.
  - *Stage 0.5* **GM stage** (always): two-pass lore visibility → tier router →
    `ensureStoryCompacted` + `ensureStoryReflected` → round loop up to
    `maxToolLoops` (default 10). Prompt built once per turn by
    `buildGMStagePrompt` (stable prefix for provider caching); each round
    streams via `providerFetch("/api/generate-stream")`; context overflow halves
    the budget once; model failure falls back one tier; leaked tool-call markup is
    stripped/recovered (`toolCallFallback.ts`, DeepSeek DSML + GLM shapes); tools
    run through `executeGMTools`; loop ends on the first round with no tool calls.
    Then gates: **M2 roll gate** (combat / challenge / high-deadly stakes with no
    roll → forced round with `tool_choice: required`, ≤2×), **plan gate** (beat
    completed without the next written → forced round, ≤2×), leniency audit (log only).
  - *Stage 1* **story**: if the GM's rounds already wrote prose, that is the
    story (visible-text extraction, divider pruning, `deAiifyText`); otherwise the
    same conversation continues with `buildStoryContinuationPrompt(...)` and
    streams. Narration model: `getEffectiveNarrationModelKey()` — default
    **Mistral Small 3.2**, override `narrationModelOverride`.
  - *Stage 3* **choices**: `buildChoicesPrompt` + `generateChoicesWithRetry`.
  - *Stage 4* `syncNewMemories` — only if embeddings enabled (dead, see [§6.9](#69-embeddings-toggle-points-at-a-deleted-backend)).
  - Finally `checkNarrationConsistency`, then the `ScenePart` is built.
- **Per-turn settings:** `maxToolLoops` (10), `customMaxContext`
  (**default 36,000** = `GM_STAGE_DEFAULT_BUDGET`, `ai_staged.ts:147` — not
  "`maxContextSize` 128k" as CLAUDE.md says), `customMaxOutput` (8000),
  `embeddingsEnabled`, `embeddingThreshold`, `webResearchEnabled`, `usePrefill`,
  `storytellerMode` (narrator/dm), `deAiifyWords`, `replyLength`, sampling
  settings — all in Settings → AI Config.

### 11.2 Reasoning tiers — `app/misc/reasoningTiers.ts`

| Tier | Model | Effort | Intended use |
|---|---|---|---|
| T0 | Mistral Nemo | none | banter |
| T1 | Mistral Small 3.2 | none | default (`SCENE_BASELINE_TIER`) |
| T2 | Grok 4.5 | high | rules, combat |
| T3 | Kimi K3 | xhigh | boss fights, campaign-shaping calls |

- **Starting tier** = max of: hard floor (session zero → T3; combat → T2, or T3
  for a single active enemy), deterministic classifier (combat 2/3, challenge 1,
  active main thread 2, else 0), last turn's tier decayed one step toward T1, and
  any observer-forced tier. A T0 classifier call labels long (>200 char) input
  when state gives no signal.
- **Mid-turn:** tier re-read every round, so `set_reasoning_tier` applies next
  round; `stakesFloor` forces T2 for "high" and T3 for "deadly" rolls
  (`gmExecutor.ts:~2081`); T3 capped at 3 calls per scene key, then clamped to T2.
- **Overrides:** `reasoningTierOverrides`, `narrationModelOverride` (AIConfigTab).
- Note: decay never goes below T1, so the GM stage never actually *starts* at
  T0; T0 is only used by the classifier and as a failure fallback.

### 11.3 GM tool catalogue

Two schema sources: `app/misc/gmTools.ts` (`GM_TOOL_SCHEMAS`, 37 tools) and
`app/misc/toolSchemas.ts` (`TOOL_SCHEMAS`, 41). The whitelist is in
`buildGMStagePrompt()` (`ai_staged.ts` — `legacyToolNames` ~l.1708 filtered from
`GM_TOOL_SCHEMAS`, `stateToolNames` ~l.1764 from `TOOL_SCHEMAS`). Execution:
`executeGMTools()` (`gmExecutor.ts`), falling through to
`executeStateTools`/`executeTools()` (`toolExecutor.ts`). Partly pinned by
`tests/aiStaged.gmStageToolWhitelist.test.ts`.

**Offered to the model (56 + 1 conditional):**

| Area | Tools |
|---|---|
| Dice / resolution | `formula_roll`, `opposed_formula`, `gm_roll` (hidden, always digital), `calculate` (the only verdict), `npc_roll`, `ask_for_roll` (**only when `diceMode === "manual"`**) |
| Oracle / entropy | `fate_question` (6 outcomes incl. "Yes, but"/"No, but"), `roll_table` (~40 built-ins + `pm_*`), `roll_portent` (peek/pinch/portent), `generate_name` (rolls constraints, not names), `increment_scene` (scene check, chaos, tension, director move) |
| Challenges | `start_challenge`, `record_challenge_result` (auto-resolves at threshold), `cancel_challenge` |
| Combat | `start_combat`, `add_combatant`, `remove_combatant`, `update_combatant_stat`, `toggle_combatant_condition`, `advance_turn`, `end_combat` |
| NPCs | `add_npc`, `update_npc`, `remove_npc`, `npc_reaction` |
| Threads / goals | `create_thread`, `update_thread`, `resolve_thread`, `abandon_thread`; `create_goal`, `update_goal`, `complete_goal`, `fail_goal`, `delete_goal` |
| Timers | `manage_timer` (create/advance/toggle_pause/cancel/trigger) — auto-advance broken, [§6.1](#61-timer-auto-advance-never-fires) |
| Notes / lore | `read_notes`, `search_notes`, `create_note`, `edit_note`, `delete_note`, `edit_lore_replace`, `edit_lore_append`, `edit_lore_prepend`, `edit_lore_insert`, `merge_lore`, `duplicate_lore` |
| Memory | `search_memory` only — `add_memory` deliberately excluded; the Memory Keeper is the sole writer |
| Campaign plan / session zero | `start_game`, `advance_plan`, `open_side_beat`, `close_side_beat` |
| Director acks | `resolve_random_event`, `acknowledge_director_move` |
| Player interaction / state | `ask_question` (1–3 multiple-choice/free-text questions; pauses the turn), `get_game_state`, `take_rest` |
| Meta | `set_reasoning_tier` |

**Defined but never offered (17):** `request_continuation` (*the GM prompt
still tells the model to use it*, `ai_staged.ts:1537`), `end_gm_thinking`,
`reaction_check` (has tests; `roll_table`'s description mentions it),
`negotiate_price` (has tests), `delegate_task` (sub-agents + web research —
`subagentExecutor.ts` and `/api/web-search` exist only for it, so the **Web
Research toggle and Brave key in Settings do nothing**), `game_over` (**the GM
currently has no way to end the game**), `add_ability`/`remove_ability`/
`modify_ability`/`upgrade_ability`/`reset_ability_cooldown` (soft-deprecated),
`list_inactive_notes`, `toggle_lore`, `add_memory` (deliberate),
`update_challenge`, `resolve_challenge`, `skip_tools`. Name clashes:
`start_challenge`, `cancel_challenge`, `take_rest`, `add_npc` exist in both files —
the `gmTools.ts` version is sent. Caveat: `executeGMTools` still has `case`
branches for several of these, so a model that emitted one anyway (e.g. via
leaked-text recovery) would probably execute it.

### 11.4 Observer (per turn) — `app/misc/observer.ts`

| Flag | Judge | Default |
|---|---|---|
| `response_length` | free word-count trip → LLM decides if length was earned | rewrite/reset |
| `player_agency` | LLM | rewrite/reset |
| `outcome_narration_mismatch` | LLM, all comparisons at once; mixed outcomes capped at "minor" | rewrite/reset |
| `missing_oracle_or_table` | shared LLM call (`checkToolUsageGaps`) | log only |
| `missing_scene_increment` | same call | log only |
| `tier_escalation_missed` | LLM; skipped at top tier | reset |

- Suspended during session zero and before a character sheet exists.
  `plausibleResetFlagTypes()` decides from free signals whether to **block**
  (a reset-eligible check could fire) or run in the **background** after the
  player has control. `player_agency` is always background.
- A major flag → `rewriteFlaggedNarration` (prose only; rolls/tools/state kept;
  choices regenerated; GM history reconciled). Full rollback + fresh attempt only
  if the rewrite fails or for `tier_escalation_missed` (retries ≥1 tier higher).
  Background flags can rewrite but never roll back. A speculative shortened
  rewrite runs in parallel with the length judge.
- Settings → Architecture (`ArchitectureSettingsTab.tsx`): `observerCheckSettings`
  (per flag `{enabled, triggersReset, sensitivity 0–10}`), `observerModelOverride`.
  (The "no settings UI exists yet" comment in `observer.ts` is stale.)
- Player sees toasts ("Narration revised…", "GM response was reset…"), an
  **Undo revision** button (`observerRewriteOriginal`); surviving flags go on
  `ScenePart.observerFlags`/`correctedObserverFlags` and into the next GM prompt.

### 11.5 Story Progress Observer — `app/misc/storyProgressObserver.ts`

LLM check-in every N accepted turns (`storyProgressCheckInterval`, default 10,
range 2–50) over the last 6 narration turns, threads, goals, spotlight neglect
and tension vs target. Emits on_track / dragging / rushing + advice, repeated
phrases (deterministic n-gram pre-pass + LLM triage) and NPC knowledge
inconsistencies → `ScenePart.storyProgressNote` / `repetitionNote` /
`knowledgeNote`, injected into the next GM prompt. **GM-only** (player sees them
only in Debug Logs). Override `storyProgressObserverModelOverride`. Neither the
override nor the interval is in `SYNCABLE_SETTINGS_KEYS`.

### 11.6 Director layer

- **State:** `AGMTState` (`structs.ts`) — `chaosFactor` 1–9, `sceneCount`,
  `tension` 0–10, `lastOracleTurn`, `tint`, `lastTintShiftScene`.
- **On `increment_scene`** (`toolExecutor.ts:~1925`): `checkScene` (Normal /
  Altered / Interrupted) → `adjustChaosFactor` / `adjustTension` →
  `selectDirectorMove()` (`mythic.ts:646`), deterministic priority:
  `tick_a_clock` → `announce_future_badness` → `put_someone_in_a_spot` (tension ≥8
  or lagging arc) → `spotlight_couch_player` → `reveal_unwelcome_truth` (lore
  `to_be_revealed`) → `spotlight_tag` (start-wizard tags, `tagFocusExamples.ts`)
  → `offer_opportunity`. Moves queue in `pendingDirectorMoves` until
  `acknowledge_director_move`; random events (with a portent) queue in
  `pendingRandomEvents` until `resolve_random_event`.
- **Director Assistant** (`directorAssistant.ts`): LLM side call on
  `increment_scene` turns; updates `storyData.directorAssistant.threadSpotlight` /
  `npcSpotlight` neglect counters that `selectDirectorMove` reads. Override
  `directorAssistantModelOverride`. Couch-player spotlight is tracked separately
  in `page.tsx` (`multiplayer.couchPlayerFocus`, `playerStyleCounts`).
- **Prima Materia** (`primaMateria.ts`): `rollPortent` (12 archetypes × sol/nox,
  6 relations), `selectFrame` (literal: combat/challenge; structural: timers or 2+
  threads; personal: NPCs), tint day/neutral/night changed only by a Lens Shift
  (doubles on 2d12), `formatTintLine` into both GM and narrator prompts, `pm_*`
  tables, `rollComplication()` seeding two pressure moves. Licensing: [§7](#7-release-blocker-prima-materia-tables).

### 11.7 Memory, reflection, compaction

- **Memory Keeper** (`memoryAgent.ts`) — sole memory writer; background, ≤3
  entries/turn, importance 0–10. Override `memoryKeeperModelOverride`.
- **Retrieval** — GM calls `search_memory` / `search_notes` (literal/tokenized
  ranking). The semantic fallback (`semanticSearchFallback.ts`) is dead.
- **Reflection** (`reflection.ts`) — at GM-stage start once 30 importance points
  accumulate; ≤3 insights/pass at importance 8; `memoryReflectedThroughIndex`.
  Override `reflectionModelOverride`.
- **Auto-compaction** (`compaction.ts`, `ensureStoryCompacted`) — every turn,
  folds aged-out history into `scene.summary` once ≥1,500 uncovered tokens
  (summary capped at 1,500), snaps to scene boundaries, validates against
  tracked entities; uses the story model (no override); "Recap…" toast.
- **Manual compaction** (`storyCompaction.ts`, Story Editor → `CompactStoryModal`)
  — prune old metadata, archive resolved threads/goals, opt-in destructive
  summarization, "spin off a new story".
- `updateStoryData` in `page.tsx` dedupes memory and caps it by model (`aiModel`).

### 11.8 Campaign plan & session zero — `app/misc/campaignPlan.ts`

- One `gm_plan` note "Campaign Plan" (spine, fronts, secrets & clues, character
  arcs) + one arc note per player. Spine presets (`CAMPAIGN_SPINE_PRESETS`):
  short 5 / **medium 7 (default)** / long 15 beats; `PlanState` tracks the beat.
- Enforced: `start_game` errors until `hasCampaignPlan()` (`gmExecutor.ts:~3705`);
  `create_note` refuses "Campaign Plan" until notes were read this turn (when
  lore/mechanics/GM notes exist); plan gate forces `advance_plan`;
  `getSetupReminder` nudges at 5 turns, urgently at 10.
- Session zero: `startFreeformStoryLocally()` (`localStoryManager.ts:321`, from the
  `GuidedStoryStart` wizard) sets `sessionZeroActive` → T3 floor, observer
  suspended; `start_game` names the story and clears it.
  `startAdventureLocally()` (creator adventures) does **not** enter session zero.

### 11.9 Multiplayer

- **Couch co-op (one device):** `StoryData.multiplayer.couchPlayers` from the
  wizard (colour, personality, wish tags, archetype); `PlayerBubbles.tsx`
  draggable per-player mic bubbles (Mistral STT, 3 s silence timeout); floor
  control (`floorControl.ts`); saved profiles (`user_settings.ts`); hot-seat modes
  host/any/timer.
- **Online P2P** (`app/misc/multiplayer/`): `NetSession` (`session.ts`) +
  `useNetSession.ts`. **Host-authoritative**: only the host generates and
  broadcasts full `StoryData` in `state_snapshot`. Transports: Trystero torrent
  (default, all 5 trackers), nostr, mqtt; PeerJS cloud; `manual` throws "isn't
  implemented yet". (`@trystero-p2p/nostr` and `/core` are imported but only
  present transitively via `trystero`.)
- **Wire messages** (`types.ts`): `state_snapshot`, `player_action`,
  `player_pass`, `presence_join`, `presence_activity`, `turn_status` (batching via
  `turnBatch.ts` — waits for all to submit/pass), `story_stream`, `tts_audio`
  (host's MP3 relayed — guests need no TTS key), `floor_state/take/release`,
  `dice_throw_request/result` (acting guest throws on their own device in
  physical mode), `ooc_chat` (never shown to the GM), `backend_switch`.
  `story_delta` is defined but never sent or handled.
- **Entry:** Library → `HostGameModal` / `JoinGameModal`; wizard "Play Online";
  Story Editor → `OnlinePlayEditor` (copy invite link); 6-char room codes (no
  0/O/1/I); `?join=CODE&provider=BACKEND` deep link → `createJoinPlaceholderStory`
  → `/story?storyId=…&join=…&joinBackend=…`, auto-join + `ProfilePickerModal`;
  auto-host via `?hostName=`.
- Wired end to end and tested (`tests/multiplayer.*`, `tests/turnBatch.test.ts`):
  batching, streaming, TTS relay, floor control, dice relay, OOC chat, profile
  claiming. Gaps: [§6.12](#612-multiplayer-guests-get-the-full-unredacted-storydata-and-cant-answer-gm-questions).

### 11.10 Cross-device sync — `app/misc/syncManager.ts`, `sync-worker/`

- Manual only (Settings → Sync → "Sync Now", `syncAll()`); no background sync.
  `SYNC_COMPLETED_EVENT` reloads library/story. Requires
  `NEXT_PUBLIC_SYNC_API_URL` at build time.
- Random sync key = only credential; worker stores its SHA-256. Client-side
  **AES-GCM**, key via **PBKDF2-SHA256, 100k iterations, fixed salt
  `your-story-sync-v1`**.
- Buckets: stories, adventures, notes, folders, settings (allowlist in
  `syncableSettingsKeys.ts`; **API keys excluded**), tables (legacy). Per-item
  merge `{id, updatedAt, payload}` — newer wins per item; deletions inferred from
  `yourStory_syncedIds_<bucket>`; state version "2".
- Worker: 60 req/min per key+IP; CORS via `ALLOWED_ORIGINS`; **each bucket is
  one KV value (25 MiB cap)** — a possible ceiling for large libraries (untested).
- `SyncConflictModal` is imported in `page.tsx` but effectively unused (merge is
  automatic).

### 11.11 Native & desktop shells

- One switch: `NEXT_PUBLIC_STANDALONE=true` → `output: "export"`. Tauri
  (`src-tauri/tauri.conf.json`: `frontendDist: ../out`, `beforeBuildCommand`
  runs the standalone build; Rust registers the http plugin + log plugin in
  debug). Capacitor (`webDir: out`, `CapacitorHttp` patches `fetch`;
  `android/` and `ios/App` checked in).
- Without API routes, wrappers call provider logic in-process when standalone:
  `providerFetch.ts`, `ttsFetch.ts`, `sttFetch.ts`, `ocrFetch.ts`,
  `ocrSummarizeStream.ts`, `creatorFetch.ts`, `webSearchFetch.ts` → shared
  `providerCall.ts`, `ttsCall.ts`, `sttCall.ts`, `ocrCall.ts`,
  `ocrSummarizeCall.ts`, `ocrMergeCall.ts`, `generateImageCall.ts`,
  `webSearchCall.ts`. `platformFetch.ts`'s `getProviderFetch()` returns Tauri's
  plugin fetch under Tauri, plain `fetch` otherwise.
- **Gaps:** side calls + Designer bypass the wrappers ([§6.7](#67-native-builds-most-ai-side-calls-and-the-designer-bypass-the-standalone-wrappers));
  Tauri allowlist incomplete ([§6.8](#68-tauri-http-allowlist-is-missing-tts-and-sync-hosts));
  unverified risk that `CapacitorHttp` buffers responses so SSE streaming on
  Android/iOS arrives all at once.

### 11.12 TTS / STT

- **TTS** (BYOK; `TTS_MODELS` in `ai_prices.ts`, `ttsCall.ts`): Cartesia Sonic-3,
  ElevenLabs Flash v2.5; text cleaned (`cleanTextForTTS`, `cleanTextForSpeech`).
  `TTSControls.tsx`: live sentence-by-sentence narration while streaming,
  auto-narrate (`ttsAutoGenerate`), scrubbable seek bar + prev/next sentence,
  IndexedDB cache (`YourStoryTTSCache`, last 5 messages per story), guest relay.
  Keys: `ttsEnabled`, `ttsAutoGenerate`, `ttsLastVoice`, `ttsModel`, `ttsVolume`,
  `ttsCustomVoices`, `cartesiaKey`, `elevenlabsKey`.
- **STT:** Mistral `voxtral-mini-latest` (`sttCall.ts`, 10 MB cap) in
  `STTButton.tsx`, couch bubbles, ask-question modal; toggle `sttEnabled`.
- Stray file: `app/components/TTSControls.tsx.backup`.

### 11.13 PDF / OCR / Markdown import — `app/components/PDFImporter.tsx`

- Opened from Library → Notes (saves into a folder) and the in-story Lore editor.
  Accepts `.pdf .png .jpg .webp .txt .md`; PDFs ≤100 MB.
- PDF: ~20-page chunks ≤4 MB (Vercel 4.5 MB body limit) → Mistral OCR
  (`ocrCall.ts`, `/v1/ocr`; image-strip retry `pdfImageStrip.ts`, then halve the
  range) → summarize (`streamSummarizeOCR` → `/api/ocr/summarize-stream`, or
  in-process when standalone; any LLM provider) → continuation rounds (default 5,
  ≤15, 240 s budget; reports `incomplete`/`unreachedParts`) → live note parsing
  (`partialNotes.ts`).
- Text/Markdown: split at headings into ~30k-char chunks (`textImportChunks.ts`).
- Cross-chunk merge: deterministic title similarity (0.7) then AI pass
  (`ocrMerge.ts` → `/api/ocr/merge`).
- Output `{lore, mechanicNotes, tableNotes, summary}` (tables as `type: "table"`
  notes; legacy shapes converted by `tableNotes.ts`). Resumable imports in
  `YourStoryPDFImportsDB`; settings in `pdfImporterSettings`.
- `/api/ocr/summarize` (non-streaming) has no client caller.

### 11.14 Adventure creator — Game Designer (`/creator`, `?edit=<id>`)

`app/creator/page.tsx` (model `designerModel`, output `designerMaxOutput`),
`DesignerChat.tsx`, `AdventureInspector.tsx`, `useDesignerSession.ts` (≤5 tool
rounds/message, 24 messages of history, `saveLocalAdventure`,
`importFromLibrary()`), `designer_ai.ts`, `designer_executor.ts` (applies to a
copy; forces mechanics/character-sheet notes `alwaysOn`). **12 designer tools:**
`set_adventure_info`, `set_premise`, `write_note`, `delete_note`, `write_npcs`,
`delete_npcs`, `write_goals`, `delete_goals`, `set_starting_choices`,
`write_presets`, `delete_presets`, `set_character_sheet_template`.

### 11.15 Library — `app/library/`

Home screen of folder tiles + recent stories (`LibraryHome`) → `FolderDetailView`
(`libraryScope.ts`) or flat Stories / Adventures / Notes lists. Folders in
localStorage `yourStory_folders` (flat, shared across item types); notes in
`YourStoryNotesLibraryDB`; `migrateTablesLibraryToNotes()` on every load.
Export/import in the UI: `.folder` bundles (`folderLibraryExport.ts`), `.notes`
(`notesLibraryExport.ts`), legacy `.tables` import. `adventureExport.ts`
(`.adventure`) has no importer and there's no per-story/per-adventure export UI.

### 11.16 3D dice tray

`@3d-dice/dice-box` via `DiceThrowModal.tsx`, `diceThrow.ts`,
`diceControlChannel.ts`, `diceColors.ts`. Only in `diceMode === "physical"`
(modes `ai | manual | physical`); `gm_roll` never uses it.
`scripts/patchDiceBox.mjs` (postinstall) decodes dice-box's base64-inlined physics
worker and patches `rollDie` (hold under pointer / throw with gesture velocity +
spin), `stepSim` (steer held dice; replace the never-firing settle check that made
every roll hit the 5 s timeout) and injects a `BroadcastChannel("ys-dice-control")`.
Structural matching, idempotent, but **tied to dice-box 1.1.4's minified output**
— it throws if that changes, so don't bump dice-box casually. Dev harness
`/dev/dice-spike` is reachable in production builds.

### 11.17 Storage (Supabase is gone)

- **IndexedDB:** `YourStoryDB` (`local_stories`, `undo_snapshots`, undo depth 8),
  `YourStoryAdventuresDB`, `YourStoryNotesLibraryDB`, `YourStoryTablesLibraryDB`
  (legacy), `YourStoryPDFImportsDB`, `YourStoryTTSCache`, a font DB.
- **localStorage:** provider keys (`openRouterKey`, `deepseekKey`, `googleKey`,
  `mistralKey`, `deepinfraKey`, `braveSearchKey`, `cartesiaKey`, `elevenlabsKey`)
  and all settings.
- **Server-side state:** only the optional sync worker. API routes are stateless.

### 11.18 API routes (all POST, BYOK, stateless)

| Route | Purpose |
|---|---|
| `api/generate` | non-streaming LLM proxy — DeepSeek, OpenRouter, Mistral, DeepInfra, **Google** (`providerCall.ts`) |
| `api/generate-stream` | SSE version |
| `api/tts/generate` | Cartesia / ElevenLabs, streamed audio |
| `api/stt/transcribe` | Mistral Voxtral |
| `api/ocr/process` | Mistral OCR for a page range |
| `api/ocr/summarize` | non-streaming notes extraction — **no caller** |
| `api/ocr/summarize-stream` | streaming notes extraction (used) |
| `api/ocr/merge` | AI cross-chunk merge |
| `api/creator/generate-image` | OpenRouter / DeepInfra images (`LoreImageGenerator`) |
| `api/web-search` | Brave proxy — only for unreachable `delegate_task` |

### 11.19 Other live pieces

Per-turn cost ledger + estimate (`turnCost.ts`, `turnCostEstimate.ts`,
`TurnCostPanel` in AI Config and Architecture tabs); `deAiify.ts`;
`pacingFeedback.ts` (reply-length trend nudge); `consistencyCheck.ts` (dead NPC
narrated present → toast); `lore.ts` triggers + per-turn visibility;
`noteMentions.ts` (clickable note/NPC highlights in prose); `gmAdvice.ts` (GM
tips, player archetypes); `nameGenerator.ts`; `LogViewer` + `ContextViewer` debug
tabs; story-stage sampling settings; `ObjectivesStrip`, `ChapterNav`; undo stack
also restores observer rewrites.

---

## 12. Documentation drift

> **Update 2026-10-21:** `CLAUDE.md` was rewritten against §12.1 and §12.2,
> along with the working loop that came over from Beat Them Right
> (decision 9). `README.md`, `docs/getting-started.md`,
> `docs/api-reference.md` and `.github/copilot-instructions.md` are still
> stale.

`CLAUDE.md` was last edited in `c1bc751` (PR #186, 2026-07-29), but most of
its stale claims were already false then: auth, tokens and coins went in
`cfc64be` "New Leafe" (2026-07-18), the Supabase routes in PR #64 (`3348a4a`,
2026-07-21) and the package in `4800dd7`. **Rewrite rather than patch.**

### 12.1 Stale or wrong claims in `CLAUDE.md`

**Commands & environment**

- "Node LTS >= 18" → **Node ≥ 20.9** (Next 16.2 `engines: >=20.9.0`; Vitest 4.1
  `^20 || ^22 || >=24`; CI uses 22).
- "The server-side vars that still matter are the Supabase quartet" → **no
  Supabase vars are read**; the only env vars are `NEXT_PUBLIC_SITE_URL`
  (OpenRouter HTTP-Referer), `NEXT_PUBLIC_STANDALONE`, `NEXT_PUBLIC_SYNC_API_URL`.
- npm scripts, Vitest config, `npx tsc --noEmit` advice — accurate.

**Generation pipeline**

- Stage labels: `generation.ts` has STAGE 0 (embedding retrieval, off), 0.5
  (GM), 1 (story), 3 (choices), 4 (memory embedding sync). No Stage 2.
- "Memory Size slider (localStorage `maxContextSize`, default 128k)" → key is
  **`customMaxContext`**, default **36,000** (`GM_STAGE_DEFAULT_BUDGET`,
  `ai_staged.ts:147`); presets 8k/16k/36k/72k/120k/200k + custom. The 60/40 split
  is correct. (Updated 2026-10-21: `computeGMStageBudget` used to apply it to
  `min(slider, model max) − maxOutputTokens`, which went negative on every model
  declaring 36k+ output, Grok 4.5 and Kimi K3 tiers included. It is now
  `max(4k, min(slider, model max − requested output))`, where requested output
  is `min(Response Length, model max output)`.)
- "Looped … until the model stops calling tools" → capped at `maxToolLoops`
  (default 10, `generation.ts:~2191`); the M2 roll gate and plan gate can force
  `tool_choice: required`.
- "Tool execution … `toolExecutor.ts` `executeTools()`, which mutates StoryData
  directly" → the GM loop calls **`executeGMTools()` in `gmExecutor.ts`**
  (`generation.ts:~2693`), which works on a `structuredClone` and delegates state
  tools to `toolExecutor.executeTools` (imported as `executeStateTools`). The
  typed `TOOL_DISPATCH` claim is accurate.
- Story stage "same model, same context" → same conversation, but narration
  always runs on the **narration model** (`getEffectiveNarrationModelKey()`,
  default Mistral Small 3.2), not the GM's tier model.
- Choices stage "`buildChoicesPrompt()` parses choices from the model's output"
  → it's a **separate LLM call** on the narration model
  (`generateChoicesWithRetry` → `parseChoices`) and only runs when
  `storyData.autoGenerateChoices` is true (`page.tsx:~2094`) — **off by default**.
- Providers "DeepSeek, OpenRouter, Mistral, DeepInfra" → also **Google AI
  Studio** (`providerCall.ts`); in standalone builds the routes are bypassed
  entirely; Google gets a filtered tool list ([§6.14](#614-google-tool-filter-is-stale--session-zero-cant-end-on-gemini)).
- "Users don't manually pick a model per stage" → every tier slot
  (`reasoningTierOverrides`), the narration model (`narrationModelOverride`) and
  each side agent (`layerSettings.ts`) are overridable in Settings; the GM can
  raise its own tier with `set_reasoning_tier`.

**GM tool list**

- `resolve_challenge` is not offered; `record_challenge_result` closes the challenge.
- `add_memory` was removed from the live set in `9b6da89` (2026-07-22); the
  Memory Keeper is the sole writer.
- `take_rest` "restores resources per the adventure's rest config" → uses the
  per-difficulty `REST_CONFIG` and only touches deprecated structured data.
- "~40 built-in element tables" → 45 Mythic categories (`mythic.ts:~6168`) + 17
  `pm_*` tables.
- Missing from the list but live: `roll_portent`, `generate_name`,
  `get_game_state`, `ask_question`, `ask_for_roll`, `start_game`,
  `set_reasoning_tier`, `increment_scene`, `resolve_random_event`,
  `acknowledge_director_move`, `open_side_beat`, `close_side_beat`,
  `advance_plan`, `add_npc`, `update_npc`, `remove_npc`, `npc_reaction`,
  `remove_combatant` (full catalogue: [§11.3](#113-gm-tool-catalogue)).
- "`Ability[]` … tools still work for backward compatibility" → the five ability
  tools haven't been offered to the GM since `8c9ff2f` (2025-12-19); the Story
  Editor still shows an Abilities section (`menu.tsx:~215`).
- "`rpgSystems.ts` only exports a few generic parsing helpers" → 1,941 lines,
  still exports all 9 system definitions + `RPG_SYSTEMS`, `getRPGSystem`,
  `rollDice`, `checkSuccess`, `describeDC`, etc. Live code uses only
  `parseChallengeRoundsValue`; `gmExecutor.ts:~124-130` imports three others
  without calling them. Tests use them.
- "`rollOnCustomTable` … gone; nothing writes [CustomTable]" → `rollOnCustomTable`
  still exists (`tableRoller.ts:13`) and `page.tsx:~3274-3281` calls it for a
  choice's legacy `table` field; folder import still calls `createLibraryTable`
  (`library/page.tsx:~270-283`), `ExportFolderModal` still exports tables, sync
  still has a `tables` bucket.
- "…the UI doesn't expose them" → the Story Editor still has Abilities,
  Variables and Relationships sections (`menu.tsx:~212-224`).

**Creator** — accurate (12 tools, `MAX_TOOL_ROUNDS = 5`, forced `alwaysOn`,
`libraryNoteId` dedupe, `summarizeDraft`, IndexedDB save), but omits that the
Designer can't work in standalone builds ([§6.7](#67-native-builds-most-ai-side-calls-and-the-designer-bypass-the-standalone-wrappers))
and that the Google filter strips every Designer tool ([§6.14](#614-google-tool-filter-is-stale--session-zero-cant-end-on-gemini)).

**Data model**

- `StoryLore` types → `LoreType` also includes `secret`, `table`,
  `dm_instructions`, `story_instructions`, `gm_plan` + 6 legacy aliases
  (`structs.ts:~170-185`), plus a two-pass `visibility` field (`hidden`,
  `to_be_revealed`, `check_per_turn`).
- "Spread-props pattern: `<Story {...storyData} />`" → **wrong.** `Story` takes
  `{ storyData, storyId, storyText, choices, … }: StoryProps` (~50 props,
  `story.tsx:~741-791`) and is called `<Story storyData={storyData} … />`
  (`page.tsx:~4975`). Spread props are only used for `MenuPage`, `LorePage`,
  `NPCsPage`, `GoalsPage`.

**Five-layer architecture** — "(4) memory (… semantic reranking …)" is dead
([§6.9](#69-embeddings-toggle-points-at-a-deleted-backend)); the section omits
`observer.ts`, `memoryAgent.ts`, `directorAssistant.ts`,
`storyProgressObserver.ts`, `pacingFeedback.ts`, `primaMateria.ts` and the
`campaignPlan.ts` gate.

**Auth and BYOK**

- "Supabase Auth; `AuthContext.tsx` (`useAuth()`), `auth.ts`" → deleted in
  `cfc64be`. **There is no auth.** `layout.tsx` wraps only `NotificationProvider`
  and `APIKeysProvider`.
- "Two DB-level auth patterns … follow this split for new routes" → no database;
  `getAuthToken.ts` deleted. Leftover `Authorization: Bearer ${token}` headers
  remain on some side calls.
- BYOK list accurate; full set in `APIKeysContext.tsx:~12-19`: 5 LLM keys +
  `braveSearchKey`, `cartesiaKey`, `elevenlabsKey`. OpenRouter also supports
  OAuth PKCE sign-in.
- "Clients forward all five provider keys on every call" → **false** for
  compaction and reflection ([§6.13](#613-compaction-and-reflection-silently-fail-with-default-settings)).
- Coins/Stripe removal claims — accurate.

**Directory map**

- `auth.ts`, `tokens.ts`, `getAuthToken.ts` — don't exist.
- "`ai.ts` legacy/non-staged path" → `ai.ts` has no prompt builder; it holds
  text helpers (`stripThinkingTags`, `extractThinkingTags`, `cleanTextForSpeech`,
  `detectRepetition`, `outputToScenePart`).
- Local managers described as "offline/optimistic" → they are the **only**
  storage; map omits `localNotesLibraryManager.ts`, `localTablesLibraryManager.ts`,
  `syncManager.ts`.
- `app/api/` list → actual routes in [§11.18](#1118-api-routes-all-post-byok-stateless);
  stories/adventures/folders/comments/tokens/subscriptions/`embeddings/*` are gone.
- `app/story/` → `stats.tsx`, `upgrades.tsx` deleted (`cb49c6b`); actual:
  `page.tsx`, `story.tsx`, `menu.tsx` + `menu/` (13 editors), `lore.tsx`,
  `npcs.tsx`, `goals.tsx`, `variables.tsx`, `ContextViewer.tsx`, `LogViewer.tsx`,
  `StoryTabBar.tsx`, `NPCReactionToast.tsx`, `create-character/form.tsx`.
- "dice visualizer" → replaced by `DiceThrowModal.tsx` / `ManualRollModal.tsx`.
- `app/library` is folder-first now (`LibraryHome.tsx`, `FolderDetailView.tsx`) with a Notes tab.
- "See `.github/copilot-instructions.md` for an exhaustive per-file breakdown" →
  that file is far more stale (~45 Supabase/coin/auth hits; documents `auth.ts`,
  `supabase.ts`, `tokens.ts`, momentum, spread props).
- Omits top-level `sync-worker/`, `src-tauri/`, `android/`, `ios/`, `scripts/`,
  `app/dev/`, `.github/workflows/`.

**Conventions**

- "Strict mode; no `any`" → `strict: true`, but 134 `any` occurrences in `app/`
  (203 lint errors incl. tests) — aspirational.
- Tailwind v4 `bg-linear-to-*` rule — accurate (0 `bg-gradient-to-*`, 215 `bg-linear-to-*`).
- "Server components are the default" → nominal: 98 of 102 `.tsx` files under
  `app/` are `"use client"`.
- Toast types also include `"info"` (`NotificationContext.tsx:13`).
- "…and `starter_stories.ts`" → dead: only `sample_adventures.ts` imports it, and
  nothing imports that.
- Workflow-confirmation rule — accurate.

### 12.2 Live subsystems `CLAUDE.md` never mentions

Standalone/native builds and the `*Fetch.ts` shims · encrypted cross-device sync
(`sync-worker/`, `syncManager.ts`, `SyncTab.tsx`) · couch co-op + online P2P
multiplayer · the Layer-5 Observer · Memory Keeper · Director Assistant · Story
Progress Observer · Prima Materia / `roll_portent` · `generate_name` ·
`get_game_state` · session zero / `start_game` / `GuidedStoryStart` wizard ·
campaign plan (`gm_plan`, `campaignPlan.ts`, side beats) · dice modes
(`ai`/`manual`/`physical`, `ask_for_roll`, 3D tray + `patchDiceBox.mjs`) ·
`ask_question` · reasoning-tier extras (`set_reasoning_tier`, T3 cap,
`stakesFloor`, tier badge) · turn cost · debug views (`ContextViewer`,
`LogViewer`) · the Settings modal tabs (AI Config, Architecture, Sync, Sampling,
Fonts; custom OpenRouter models) · TTS/STT · OCR/PDF/Markdown import · notes
library + `.adventure`/`.notes`/`.folder`/`.tables` formats · model-quirk
workarounds (`toolCallFallback.ts`, `turnTimeline.ts`, DeepSeek reasoning replay,
Mistral tool-call ID normalisation) · auto + manual compaction · two-pass
visibility · `noteMentions.ts`, `ChapterNav`, `ObjectivesStrip`,
`pacingFeedback.ts`, `deAiify.ts`, `gmAdvice.ts` · image generation · PWA, Vercel
analytics, privacy/terms pages, `tokenCounter.ts`. Details for most are in [§11](#11-whats-live-today--feature-inventory).

### 12.3 Other docs

| Last commit | File | Verdict | Note |
|---|---|---|---|
| 2025-11-15 | `docs/token_database.md` | historical | token-trading schema |
| 2025-11-16 | `docs/backend-integration.md` | stale | Supabase CRUD routes |
| 2025-11-16 | `docs/MOMENTUM_MIGRATION_README.md` | historical | not labelled deprecated |
| 2025-11-20 | `docs/pwa-setup.md` | partly stale | old next-pwa options; PWA inactive ([§6.11](#611-pwa-layer-is-inactive)) |
| 2025-11-23 | `docs/ui-art-direction.md` | partly stale | light-mode palette |
| 2025-11-23 | `docs/architecture.md` | stale | `/api/story/next`, Supabase |
| 2025-12-03 | `docs/supabase-setup.md` | stale | |
| 2025-12-03 | `docs/ai-integration.md` | stale | |
| 2025-12-04 | `docs/testing.md` | **stale** | lists 8 test files (2 don't exist); 106 exist; momentum/item checklists |
| 2025-12-04 | `docs/choice-system.md` | stale | advantage/item system |
| 2026-07-19 | `docs/ai-gm-integration-plan.md` | historical | |
| 2026-07-19 | `docs/story-encryption.md` | stale | says auth + RLS protect data; sync now does AES-GCM |
| 2026-07-19 | `docs/mythic_notes.md` | historical | self-labelled |
| 2026-07-19 | `docs/ai-gm-deep-audit-findings.md` | historical | |
| 2026-07-20 | `docs/research-paper-*.md` (4), `research-papers-interpretation.md` | historical | the gap analysis calls unreachable tools "Implemented" |
| 2026-07-20 | `docs/POINTS_MIGRATION_README.md` | historical | labelled deprecated |
| 2026-07-20 | `docs/README.md` (index) | stale | Supabase; links 3 missing docs |
| 2026-07-20 | `docs/event-sourcing-alternative.md` | historical | decision record, still valid |
| 2026-07-20 | `docs/api-reference.md` | **stale** | documents `/api/auth/*`, `/api/story/next`, folders, stories, adventures — none exist; none of the 10 live routes documented |
| 2026-07-22 | `docs/getting-started.md` | stale | Supabase env vars + setup |
| 2026-07-22 | `docs/tts-integration.md` | current | |
| 2026-07-22 | `docs/architecture-frontier.md` | partly stale | says multiplayer is same-device only |
| 2026-07-26 | `docs/rpg-systems.md` | partly stale | "only parsing helpers"; names nonexistent `parsePointsValue` |
| 2026-07-26 | `docs/gm-plan-notes-design.md` | current | |
| 2026-07-27 | `docs/dice-visualization.md` | current | 3D tray + patch |
| 2026-07-28 | `docs/five-layer-architecture-changelog.md` | current | through Phase 8 |
| 2026-08-03 | `docs/prima-materia.md` | current | |
| 2026-08-03 | `docs/game-mechanics.md` | current, minor drift | still lists `add_memory` and ability tools as usable; `take_rest` "adventure's rest configuration" and "reduces stress" (it doesn't) |
| 2026-07-27 | `.github/copilot-instructions.md` | **stale** | Supabase/auth/tokens/momentum |
| 2026-07-20 | `README.md` (root) | **stale** | Supabase auth, DeepSeek-only, token economy, `app/api/story/next` |
| 2025-11-16 | `VERCEL_AUTH_FIX.md` | historical | Supabase client that no longer exists |
| 2026-07-19 | `ENCRYPTION_IMPLEMENTATION.md` | stale | points at `docs/story-encryption.md` |
| 2026-07-24 | `sync-worker/README.md` | current | |
| — | `docs/*.sql` (27 files) | historical | one-off Supabase migrations; no database any more |

**Docs actually safe to trust today:** `game-mechanics.md` (minor drift),
`five-layer-architecture-changelog.md`, `gm-plan-notes-design.md`,
`prima-materia.md`, `dice-visualization.md`, `tts-integration.md`,
`sync-worker/README.md`, and this report.

---

## 13. Codebase map & hotspots

~139.5k lines of TS/TSX in `app/` (234 files) + ~29k in `tests/` (108 files).

| Area | Files | Lines |
|---|---|---|
| `app/misc/` (core logic) | 122 | 88,539 (incl. 26k-line generated `gameIcons.ts`) |
| `app/components/` | 61 | 24,527 |
| `app/story/` | 25 | 19,365 |
| `app/library/` | 7 | 3,444 |
| `app/creator/` | 4 | 1,592 |
| `app/api/` | 10 | 395 (thin proxies) |
| `sync-worker/src/` | 1 | 134 |
| `scripts/` | 2 | 675 |

**Largest hand-written files** (refactor candidates — high change-collision risk):

| Lines | File |
|---|---|
| 6,400 | `app/misc/mythic.ts` |
| 6,145 | `app/misc/gmExecutor.ts` |
| 5,290 | `app/story/page.tsx` (state/orchestration shell) |
| 4,467 | `app/components/PDFImporter.tsx` |
| 3,831 | `app/misc/generation.ts` |
| 3,468 | `app/misc/toolExecutor.ts` |
| 2,720 | `app/misc/gmTools.ts` |
| 2,253 | `app/misc/ai_staged.ts` |
| 2,022 | `app/misc/observer.ts` |
| 1,941 | `app/misc/rpgSystems.ts` (CLAUDE.md claims it "only exports a few generic parsing helpers") |
| 1,887 | `app/story/story.tsx` |
| 1,769 | `app/story/menu.tsx` |
| 1,644 | `app/story/ContextViewer.tsx` |
| 1,504 | `app/misc/structs.ts` |

Note the **two parallel tool stacks**: `gmTools.ts` + `gmExecutor.ts` (the live
GM path) and `toolSchemas.ts` + `toolExecutor.ts` (shared/state tools, plus the
dead duplicates listed in [§10](#10-dead-code)). Know which one you're editing.

---

## 14. Environment, config & deployment facts

- **Env vars actually read by the app** (`grep process.env`):
  `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_STANDALONE`, `NEXT_PUBLIC_SYNC_API_URL`,
  `NODE_ENV`. That's all. **No Supabase vars are read**; `@supabase/supabase-js`
  is not installed. AI provider keys are BYOK in browser localStorage.
- **Supabase removal:** `cfc64be` "New Leafe" (Jul 18) deleted the auth and
  token routes; PR #64 (`3348a4a`, Jul 21) "Remove dead Supabase-backed routes
  and auth stub for full-local pivot"; `4800dd7` dropped the package.
  `app/misc/AuthContext.tsx`, `auth.ts`, `getAuthToken.ts`, `supabase.ts` no longer
  exist. Remaining mentions: `localStoryManager.ts` (comment) and
  `app/privacy/page.tsx` (check the privacy policy text is still accurate).
  All `docs/*.sql` migrations are now **historical**.
- **API routes** (all thin proxies, `app/api/*/route.ts`): `generate`,
  `generate-stream`, `creator/generate-image`, `ocr/process`, `ocr/merge`,
  `ocr/summarize`, `ocr/summarize-stream`, `stt/transcribe`, `tts/generate`,
  `web-search`.
- **`next.config.ts`:** wraps config in `@ducanh2912/next-pwa` (disabled in
  dev, aggressive front-end nav caching). `turbopack: {}`.
  `allowedDevOrigins: ["10.0.0.198"]` (a LAN IP — fine for dev). When
  `NEXT_PUBLIC_STANDALONE=true`: `output: "export"`, unoptimized images; the app
  then calls providers directly instead of via `/api/*`
  (`app/misc/providerFetch.ts`, `app/misc/standalone.ts`, `app/misc/platformFetch.ts`).
- **Native shells:** Tauri desktop (`src-tauri/`, `productName` "Your Story",
  `identifier` `com.yourstory.desktop`, version 0.1.0) using
  `@tauri-apps/plugin-http` to bypass CORS; Capacitor mobile (`android/`,
  `ios/`, `capacitor.config.ts`: `appId` `com.yourstory.app`, `webDir: out`,
  `CapacitorHttp` enabled to bypass CORS). Builds via `build-apps.yml` — never
  run, unsigned.
- **Sync worker** (`sync-worker/`): Cloudflare Worker + KV (`binding SYNC_KV`,
  namespace id committed in `wrangler.toml`), `ALLOWED_ORIGINS` =
  localhost:3000 + `your-story.io` + `www.your-story.io`. No accounts: the app
  generates a random sync key that is both the bearer token and the client-side
  encryption key; the worker stores only ciphertext keyed by a hash of it.
  Routes: `GET /sync/manifest`, `GET|PUT /sync/:bucket` for
  `stories | adventures | notes | tables | folders | settings`. Deployed in July
  (PR #117); current deployment state unverified. `NEXT_PUBLIC_SYNC_API_URL`
  must be baked in at build time for each target.
- **Web hosting:** Vercel — `sync-worker/README.md` calls it "the Vercel
  testing deployment", and commit `2a75ccb` describes the native apps as the real
  target. The production domain appears to be `your-story.io` (it is in the sync
  worker's `ALLOWED_ORIGINS`). Deployment state unverified from here.
  `@vercel/analytics` and `@vercel/speed-insights` are dependencies but **nothing
  imports them** (so no analytics are collected); `@capacitor/core` is likewise
  not imported by app code (Capacitor still needs it at native build time).
- **Local dev:** `.claude/launch.json` defines `your-story-dev` (`npm run dev`,
  port 3000).
- **Root-level docs that are historical:** `VERCEL_AUTH_FIX.md` (Supabase auth
  fix for a client that no longer exists), `ENCRYPTION_IMPLEMENTATION.md` and
  `docs/story-encryption.md` (say data is protected by "authentication and
  row-level security" — there is no auth any more; sync data *is* client-side
  encrypted).

---

## 15. Decisions that need the product owner

1. **Prima Materia tables** — get permission / strip / replace ([§7](#7-release-blocker-prima-materia-tables)). Blocks public release.
2. **`take_rest`** — remove the tool and rest system (it only affects
   deprecated structured data), or rework it to do something meaningful for
   freeform character sheets ([§8.2](#82-clauderemove-rest-tool-gm-kj333b--redo-fresh)).
3. **`next-pwa` replacement** — accept the build-time advisories, or migrate
   the PWA layer ([§4.1](#41-npm-audit-2026-10-20)).
4. **Native apps** — commit history says they're the real target. If so,
   [§6.7](#67-native-builds-most-ai-side-calls-and-the-designer-bypass-the-standalone-wrappers)/[§6.8](#68-tauri-http-allowlist-is-missing-tts-and-sync-hosts)
   are top priority; run `build-apps.yml` once and decide on code-signing. If
   not, consider removing `src-tauri/`, `android/`, `ios/` and the Capacitor/Tauri deps.
5. **Unreachable tools** — re-offer or delete each of `game_over`,
   `delegate_task` (+ Web Research toggle, Brave key, `/api/web-search`),
   `reaction_check`, `negotiate_price`, `request_continuation` ([§6.10](#610-unreachable-gm-tools-with-live-looking-ui-or-prompt-references)).
6. **PWA** — fix it (Turbopack-compatible service worker + real icons) or drop
   next-pwa and the manifest ([§6.11](#611-pwa-layer-is-inactive)).
7. **Embeddings** — delete the toggle and client, or rebuild semantic search
   client-side/BYOK ([§6.9](#69-embeddings-toggle-points-at-a-deleted-backend)).
8. **Multiplayer redaction** — how much GM-only state guests may receive
   ([§6.12](#612-multiplayer-guests-get-the-full-unredacted-storydata-and-cant-answer-gm-questions)).
9. **Analytics** — wire in `@vercel/analytics`/`speed-insights` or remove them
   (and check `app/privacy/page.tsx`, which still describes Supabase auth).
10. **Frontier 1 (NPCs as agents)** and **H6/H8** — explicitly gated on owner
    approval by the design docs.
11. **Branch cleanup** — OK to delete ~100 merged remote branches?

---

## 16. Recommended plan for the next session

Ordered by value ÷ (effort × risk). Each is sized to be one PR.

1. **Security bump** *(small, low risk)* — `npm audit fix`; `next` +
   `eslint-config-next` → 16.4.2; `@capacitor/*` → 8.5.3; vitest → 4.1.12.
   **Done when:** criticals gone from `npm audit`, tests + tsc + both builds green,
   remaining advisories listed in the PR body.
2. **PR CI + lint ratchet** *(small)* — new `.github/workflows/ci.yml` on
   `pull_request` and `push: master`: `npm ci`, `npx tsc --noEmit`,
   `npx vitest run`, `node scripts/lint-ratchet.mjs` (salvaged from `b4fcf9b`,
   baseline regenerated). Optionally `npm run build`. **Done when:** the PR
   itself shows the check green and a deliberately added lint error fails it.
3. **One shared side-call helper** *(small–medium, highest gameplay value)* —
   fixes [§6.13](#613-compaction-and-reflection-silently-fail-with-default-settings)
   and [§6.7](#67-native-builds-most-ai-side-calls-and-the-designer-bypass-the-standalone-wrappers)
   together. Add e.g. `callSideModel()` that always goes through `providerFetch`,
   always forwards all five provider keys, and logs failures to Debug Logs; move
   observer, memory keeper, reflection, compaction, director assistant, story
   progress observer, sub-agents and the Designer onto it; add a test forbidding
   raw `fetch("/api/` outside the `*Fetch.ts` wrappers and one asserting every
   side call forwards `mistralKey`. Also add Cartesia, ElevenLabs and the sync
   origin to `src-tauri/capabilities/default.json` ([§6.8](#68-tauri-http-allowlist-is-missing-tts-and-sync-hosts)).
   **Done when:** with only a Mistral key saved, a long story produces a
   compaction summary and reflection insights on the web build, and a
   `NEXT_PUBLIC_STANDALONE=true` build runs a turn with observer + memory keeper
   active and the Designer replies.
   Then **fix the Google tool filter** ([§6.14](#614-google-tool-filter-is-stale--session-zero-cant-end-on-gemini)) — derive it from the whitelist, add a test that `start_game` survives it.
4. **Timer auto-advance fix + `end_gm_thinking` removal** *(medium)* —
   [§6.1](#61-timer-auto-advance-never-fires). Add a test that an `auto_advance`
   timer ticks once per completed GM turn and triggers at 0. Consider folding
   in [§6.2](#62-storythreadlinkedtimerid--threshold-are-never-written)
   (`linkedTimerId`).
5. **React render bugs** *(small)* — [§6.3–6.5](#63-goalstsx-mutates-storydata-during-render--random-keys),
   delete `SkillTreeEditor`/`SkillTreeView`, `eslint --fix` for `prefer-const`;
   lower the ratchet baseline.
6. **Docs refresh** *(small, no code)* — rewrite the stale parts of `CLAUDE.md`
   per [§12](#12-documentation-drift) (auth/Supabase/env vars, API routes, directory map,
   tool list, add Observer / multiplayer / sync / native / Prima Materia /
   campaign-plan sections); rewrite `README.md`; fix `docs/getting-started.md`;
   mark `VERCEL_AUTH_FIX.md`, `ENCRYPTION_IMPLEMENTATION.md`,
   `docs/story-encryption.md` and the `*.sql` files as historical (or move them
   to `docs/archive/`); update `architecture-frontier.md`'s Frontier 6.
7. **Dead-code sweep** *(medium)* — challenge system B, duplicate `take_rest`,
   `mythic.ts` local `AGMTState`, `parseDifficulty`, orphan components/modules,
   `TTSControls.tsx.backup`, unused imports ([§10](#10-dead-code)).
8. **Product decisions** ([§15](#15-decisions-that-need-the-product-owner)) — then act on `take_rest`,
   Prima Materia, PWA, embeddings and the unreachable tools.
9. **Multiplayer** — redact GM-only state from guest snapshots; relay
   `ask_question`/`ask_for_roll` to guests ([§6.12](#612-multiplayer-guests-get-the-full-unredacted-storydata-and-cant-answer-gm-questions)).
10. **Roadmap** — `ask_question` spotlight gap → per-chapter tension target +
    sparkline → NPC-scoped reflection ([§9.1](#91-the-frontier-docs-if-you-only-do-three-things-next)).
11. **Later / opportunistic** — split the 5k-line files (`page.tsx`,
   `PDFImporter.tsx`, `gmExecutor.ts`, `mythic.ts`) when touching them; pay down
   `any`; major upgrades (TS 7, Vitest 5, ESLint 10) one at a time; delete merged
   remote branches.

---

## Appendix A — commands to reproduce this report

```bash
# history (clones in cloud sessions are shallow)
git fetch --unshallow origin master
git fetch origin '+refs/heads/*:refs/remotes/origin/*'
git log origin/master --format=%ad --date=format:%Y-%m | sort | uniq -c

# branches with commits not on master
for b in $(git branch -r --format='%(refname:short)' | grep -v 'origin/master\|HEAD'); do
  n=$(git rev-list --count origin/master..$b); [ "$n" != 0 ] && echo "$n $b"; done

# health
npm ci
npx vitest run
npx tsc --noEmit
npx eslint .
npm run build
NEXT_PUBLIC_STANDALONE=true npm run build
npm audit
npm outdated

# would a stranded branch merge? (doesn't touch the working tree)
git merge-tree --write-tree origin/master origin/<branch>

# timer bug evidence
grep -n "isComplete" app/misc/gmExecutor.ts
grep -n "end_gm_thinking" app/misc/ai_staged.ts   # no hits = not whitelisted
```

---

## Appendix B — full PR history (July 2026)

All 188 PRs (#1–#188) were merged; none were closed unmerged. Titles are the PR titles from the merge commits.

| PR | Merged | Title |
|---|---|---|
| #1 | 2026-07-18 | Add reasoning-tier model router; remove Stripe purchase layer |
| #2 | 2026-07-18 | Overhaul GM context/tool architecture and add live progress UI |
| #3 | 2026-07-19 | Integrate /story with the global Notes Library and split menu.tsx |
| #4 | 2026-07-19 | Fix voice input never sending saved Mistral key to STT endpoint |
| #5 | 2026-07-19 | Overhaul OCR import model picker: all providers, all models, custom for any |
| #6 | 2026-07-19 | Redesign story editor as infinite-scroll categories |
| #7 | 2026-07-19 | Fix TTS to use BYOK DeepInfra key instead of outdated auth token |
| #8 | 2026-07-19 | Fix OCR import crashing/reloading the tab on large PDFs |
| #9 | 2026-07-19 | Redesign story page tab bar with morphing indicator, move Menu to header |
| #10 | 2026-07-19 | Improve tool arg validation: coerce unambiguous scalars, clarify oneOf docs |
| #11 | 2026-07-19 | Fix TTS play/autoplay: reuse a gesture-primed audio element |
| #12 | 2026-07-19 | Fix TTS reading raw AI output instead of visible story text |
| #13 | 2026-07-19 | Add couch co-op speech-to-text player bubbles |
| #14 | 2026-07-19 | Fix corrupted GM prompts: restore player agency, pacing, and table-usage guidance |
| #15 | 2026-07-19 | Fix OCR PDF chunking memory crash on mobile browsers |
| #16 | 2026-07-19 | Fix "body stream already read" error in PDF Importer OCR flow |
| #17 | 2026-07-19 | Fix broken PDF/OCR import |
| #18 | 2026-07-19 | Fix mobile browser crash importing large PDFs |
| #19 | 2026-07-19 | Remove outdated game-feel systems, refactor menu toward ttrpg/notes model |
| #20 | 2026-07-19 | Add AI GM integration plan mapping the five-layer paper onto this codebase |
| #21 | 2026-07-19 | Fix M1/M2 mythic table issues |
| #22 | 2026-07-20 | Deprecate the structured Inventory system; correct false encryption claims |
| #23 | 2026-07-20 | Fix create_note tool rejecting type "character_sheet" |
| #24 | 2026-07-20 | Fix GM verbosity: honor Response Length setting and add pacing guidance |
| #25 | 2026-07-20 | Tighten GM length guidance to cut turn verbosity |
| #26 | 2026-07-20 | Fix misleading errors when a GM tool call gets cut off by the token limit |
| #27 | 2026-07-20 | Fix and modernize the AI Context Viewer for the five-layer architecture |
| #28 | 2026-07-20 | TTRPG-theory-paper gap analysis + implementation (GM tools, hardness, visibility, undo) |
| #29 | 2026-07-20 | Remove conditions, achievements, and quest XP system; replace with threads and goals |
| #30 | 2026-07-20 | Add offer_opportunity as a fifth GM director move |
| #31 | 2026-07-20 | Fix OCR chunk timeouts on large PDF imports |
| #32 | 2026-07-20 | Redesign story start into a guided freeform wizard and rework the story composer |
| #33 | 2026-07-20 | Add link-based PDF import and fix OCR crash on large files |
| #34 | 2026-07-20 | Add CLAUDE.md with current architecture and dev commands |
| #35 | 2026-07-20 | Add select-all to note picker and bring OCR tables along with notes |
| #36 | 2026-07-20 | Fix composer input row and story table rendering |
| #37 | 2026-07-20 | Simplify story page header: hide site chrome while playing, merge story-name row into tab bar |
| #38 | 2026-07-20 | Refresh landing page for the BYOK era |
| #39 | 2026-07-20 | Simplify story page chrome and fix bottom gap |
| #40 | 2026-07-20 | Use dynamic viewport height on the story page |
| #41 | 2026-07-20 | Pin composer to the bottom of the story screen |
| #42 | 2026-07-20 | Rework turn display: fix <output> tag leaks, show thinking/tools as inline Claude-style pills |
| #43 | 2026-07-20 | Fix streaming flicker and dropped GM reasoning on save |
| #44 | 2026-07-20 | Add spotlight_tag director move for player-picked story-start tags |
| #45 | 2026-07-21 | Add delegate_task: GM sub-agent delegation for NPCs, locations, and research |
| #46 | 2026-07-21 | Add serverless P2P multiplayer transport layer (Trystero + PeerJS) |
| #47 | 2026-07-21 | Fix per-keystroke rerender and mobile keyboard scroll bugs on /story |
| #48 | 2026-07-21 | Redesign online co-op UI: global settings in Menu, Host/Join entry points |
| #49 | 2026-07-21 | Remove the animated dice-roll popup for GM/AI rolls |
| #50 | 2026-07-21 | Stream and save story-stage reasoning as collapsible thought bubbles |
| #51 | 2026-07-21 | Fix story view opening scrolled to top instead of bottom |
| #52 | 2026-07-21 | Track and surface failed pages in PDF/OCR imports |
| #53 | 2026-07-21 | Add folder move/export/import for Tables, always-visible Select All, and OCR folder prompt |
| #54 | 2026-07-21 | Pipeline PDF import OCR and note extraction per chunk |
| #55 | 2026-07-21 | Fix reasoning display disappearing on tool-call turns |
| #56 | 2026-07-21 | Add extractRollNumber helper for free-text roll parsing (WIP) |
| #57 | 2026-07-21 | Paginate story notes list to fix lag with large note counts |
| #58 | 2026-07-21 | Add resumable PDF OCR imports and persistent importer settings |
| #59 | 2026-07-21 | Fix live reasoning bubble getting dropped mid-stream |
| #60 | 2026-07-21 | Drop <output> tag requirement from GM stage prompt |
| #61 | 2026-07-21 | Spike @3d-dice/dice-box for physics-based 3D dice |
| #62 | 2026-07-21 | Highlight lore/NPC mentions in story prose, clickable to open the note |
| #63 | 2026-07-21 | Teach OCR import to generate lore aliases |
| #64 | 2026-07-21 | Remove dead Supabase-backed routes and auth stub for full-local pivot |
| #65 | 2026-07-21 | Stream GM thinking live instead of a collapsed pill |
| #66 | 2026-07-21 | Fix Story tab scrolling into empty space with keyboard open |
| #67 | 2026-07-21 | Replace Story Editor AI menu with online OOC player chat |
| #68 | 2026-07-21 | Fix 3D dice tray sizing/positioning on mobile |
| #69 | 2026-07-21 | Add folder export/import to the library |
| #70 | 2026-07-21 | Overhaul search_notes: tokenized ranking, centered excerpts, type/tag filters |
| #71 | 2026-07-21 | OCR notes creator: extract relatedCharacters/relatedLocations/keys |
| #72 | 2026-07-21 | Add Reply Length control to tighten narration verbosity |
| #73 | 2026-07-21 | Fix story auto-scroll jumping, drop AI action-suggestion chips, and fix manual-roll voice input |
| #74 | 2026-07-21 | Fix story composer hidden behind mobile keyboard |
| #75 | 2026-07-21 | Add Cartesia Sonic-2 and ElevenLabs Flash v2.5 as TTS alternatives |
| #76 | 2026-07-21 | Add player archetype selection and scene-start GM advice |
| #77 | 2026-07-21 | Stream TTS audio chunk-by-chunk instead of buffering the whole response |
| #78 | 2026-07-21 | TTS: fix live playback bug + add live sentence-by-sentence auto-narration |
| #79 | 2026-07-22 | Redesign Story Editor menu with a glass + glow dark UI |
| #80 | 2026-07-22 | Fix couch-coop STT: no auto-generate on bubble tap, allow concurrent speakers |
| #81 | 2026-07-22 | Add ask_question GM tool for structured player questions |
| #82 | 2026-07-22 | Add a Layer-5 observer that catches and resets bad GM turns |
| #83 | 2026-07-22 | Fix stale [GAME MASTER]/[GM] bracket format in the live GM stage prompt and remove dead pre-tool-calling code |
| #84 | 2026-07-22 | Add de-AI-ify pass to swap out overused AI vocabulary in narration |
| #85 | 2026-07-22 | Add one-click "select all in folder" to the notes/tables picker |
| #86 | 2026-07-22 | Fix challenge-system bugs, add a memory agent, extend the observer |
| #87 | 2026-07-22 | Speed up TTS chunking, clean text for speech, and fix stop/auto-narrate button behavior |
| #88 | 2026-07-22 | Add a Settings > Architecture tab for the five-layer architecture |
| #89 | 2026-07-22 | Add a Director Assistant: LLM spotlight tracking for the Director layer |
| #90 | 2026-07-22 | Add a manual Compact Story tool to the Story Editor |
| #91 | 2026-07-22 | Remove the TTS button, auto-narrate by default |
| #92 | 2026-07-22 | Fix voice bubbles unclickable behind queued-transcript panel |
| #93 | 2026-07-22 | Rework Undo/Retry to properly reset mechanical game state |
| #94 | 2026-07-22 | Improve GM prompting: conditional rolls, reasoning-aware prefill, per-turn advice, richer GM context |
| #95 | 2026-07-22 | Replace the composer's STT button with an always-on voice bubble |
| #96 | 2026-07-22 | Include the flagged narration in the length-observer's corrective prompt |
| #97 | 2026-07-22 | Fix live TTS narration silently stopping after a \|\|spoiler\|\| closes |
| #98 | 2026-07-22 | Fix auto-narrate TTS silently blocked by browser autoplay policy |
| #99 | 2026-07-22 | Let the GM justify long turns before the observer resets them |
| #100 | 2026-07-22 | Remove DeepInfra TTS (Kokoro/Orpheus), expand Cartesia/ElevenLabs voices |
| #101 | 2026-07-22 | Fix 3D dice tray: dice invisible until thrown, canvas tiny/uncentered |
| #102 | 2026-07-22 | Add periodic Story Progress Observer (Layer 3 pacing check-in) |
| #103 | 2026-07-22 | Fix 3D dice tray: sizing, visibility, and drag-throw physics |
| #104 | 2026-07-23 | Fix 3D dice throw physics: dice roll in from the rim instead of flying off |
| #105 | 2026-07-23 | Make the Observer AI's automatic correction a targeted rewrite, not a blind retry |
| #106 | 2026-07-23 | Detect repeated GM phrases in the Story Progress Observer |
| #107 | 2026-07-23 | Mark voice-transcribed input so the GM tolerates STT typos |
| #108 | 2026-07-23 | Warn player during streaming that the Observer may reset this turn |
| #109 | 2026-07-23 | Fix streaming auto-scroll and live TTS during story generation |
| #110 | 2026-07-23 | Surface observer/story-progress checks in Debug Logs and AI Context Viewer |
| #111 | 2026-07-23 | Add TTS skip controls and a waveform recording overlay for voice input |
| #112 | 2026-07-23 | Fix observer rewrite/reset firing after the turn was already finalized |
| #113 | 2026-07-23 | Show reasoning-tier badge next to Game Master |
| #114 | 2026-07-23 | Add a Suggested Choices settings toggle for per-turn AI action chips |
| #115 | 2026-07-23 | Add tier_escalation_missed observer check for reasoning-tier misses |
| #116 | 2026-07-23 | Add no-auth, encrypted cross-device sync for stories/adventures/folders/settings |
| #117 | 2026-07-23 | Deploy sync-worker to Cloudflare and wire in the live KV namespace |
| #118 | 2026-07-23 | Fix observer rewrite not reaching displayed/saved narration |
| #119 | 2026-07-23 | Replace whole-bucket last-write-wins sync with per-item merge |
| #120 | 2026-07-23 | Push the GM harder toward oracle/table use over manufactured certainty |
| #121 | 2026-07-23 | Add turn-by-turn AI activity history to the AI Context viewer |
| #122 | 2026-07-23 | Allow your-story.io in sync-worker CORS |
| #123 | 2026-07-23 | Merge duplicate/fragmented lore across OCR-imported PDF chunks |
| #124 | 2026-07-23 | Refresh Library and open Story after a sync actually changes something |
| #125 | 2026-07-23 | Convert popup modals to full-screen game-menu views |
| #126 | 2026-07-23 | Fix duplicate GM bubbles on stream end and doubled ">" prefix on input |
| #127 | 2026-07-23 | Stop blocking the player on observer/side-call latency when no reset is possible |
| #128 | 2026-07-23 | Add Notes Library to cross-device sync |
| #129 | 2026-07-23 | Fix OCR notes/tables preview not showing for multi-file imports |
| #130 | 2026-07-23 | Make hover-only library controls tap-accessible on mobile |
| #131 | 2026-07-23 | Reset per-device sync bookkeeping when the sync key changes |
| #132 | 2026-07-23 | Fix dead sync key buttons and self-heal devices stranded before the reset fix |
| #133 | 2026-07-23 | Carry observer-corrected flags into next turn's context |
| #134 | 2026-07-23 | Replace TTS sentence-skip controls with a scrubbable seek bar |
| #135 | 2026-07-23 | Add get_game_state GM tool for mid-turn state re-sync |
| #136 | 2026-07-24 | Add multiplayer wire protocol for batching, streaming, TTS relay, floor control |
| #137 | 2026-07-24 | docs: design spec for GM plan notes (rolling one-beat-ahead campaign spine) |
| #138 | 2026-07-24 | Fix join-via-link not prefilling room code/backend |
| #139 | 2026-07-24 | Add campaign-length spine presets and ground the plan in existing notes |
| #140 | 2026-07-24 | Fix flaky BitTorrent backend, thin online profile creator, mobile input block |
| #141 | 2026-07-24 | Enforce reading existing notes before plan creation; point plan-writing at the oracle |
| #142 | 2026-07-24 | Add Tables Library to cross-device sync; fix stories un-filing bug |
| #143 | 2026-07-24 | Fix multi-dice formulas, player rolls in combat, and undo/stop state sync |
| #144 | 2026-07-24 | Fix stuck loading state after streaming completes |
| #145 | 2026-07-24 | Instruct GM to escalate to top reasoning tier for campaign-plan work |
| #146 | 2026-07-24 | Remove homepage Create button, add Continue Playing list |
| #147 | 2026-07-24 | Add a dedicated Folders tab for creating, renaming, and deleting folders |
| #148 | 2026-07-24 | Force top reasoning tier during session zero, add start_game tool |
| #149 | 2026-07-24 | Cache TTS audio per story to avoid re-generating on replay |
| #150 | 2026-07-24 | docs: add Phase 5 design — situations over plots (Fronts, triggers, structured handoff) |
| #151 | 2026-07-24 | fix(gm-tools): whitelist start_game so the GM stage can actually call it |
| #152 | 2026-07-24 | Shift reply-length tiers shorter and add a shorter Short |
| #153 | 2026-07-24 | Reconcile GM history after an observer rewrite |
| #154 | 2026-07-24 | Add generate_name so the GM rolls naming constraints, not names |
| #155 | 2026-07-24 | Scope the observer, tell it who the player character is, and let the player undo it |
| #156 | 2026-07-25 | Use the Observer's model override for its rewrite call too |
| #157 | 2026-07-25 | Save player 1's profile so it prefills the Start-a-Story wizard |
| #158 | 2026-07-25 | Recover DeepSeek tool calls leaked as <\|DSML\|invoke> markup |
| #159 | 2026-07-25 | Price a whole turn, not just the GM call |
| #160 | 2026-07-25 | Rework the Notes tab layout for mobile |
| #161 | 2026-07-25 | Overlap the observer's judges and the length rewrite |
| #162 | 2026-07-25 | Give the rewrite the reasoning behind the narration it's fixing |
| #163 | 2026-07-25 | Push the GM toward the oracle and random tables |
| #164 | 2026-07-26 | Require a campaign plan before the game can start |
| #165 | 2026-07-26 | Make the dice tools report rolls instead of judging them |
| #166 | 2026-07-26 | Make the 3D dice throw follow the drag gesture |
| #167 | 2026-07-26 | Stop the observer from flagging correctly-resolved partial successes |
| #168 | 2026-07-26 | Recover image-heavy PDF pages by stripping images and retrying OCR |
| #169 | 2026-07-27 | Keep extracting import notes while there is still content left |
| #170 | 2026-07-27 | Replace the adventure creator with a conversational Game Designer |
| #171 | 2026-07-27 | Refresh OpenRouter model catalog and fix reasoning-effort handling |
| #172 | 2026-07-27 | Dice tray: hold the dice in hand, throw by flick, colour by die type |
| #173 | 2026-07-27 | Stop OCR imports from returning tables instead of notes |
| #174 | 2026-07-27 | Stream OCR import notes into a redesigned importer UI |
| #175 | 2026-07-27 | Import notes into the creator, and finish removing Coins |
| #176 | 2026-07-27 | Stop the OCR importer restarting a finished extraction |
| #177 | 2026-07-27 | Read the whole document on OCR import, and keep the rules intact |
| #178 | 2026-07-27 | Make thrown dice carry the hand's momentum |
| #179 | 2026-07-27 | Stop the oracle from answering yes to everything |
| #180 | 2026-07-28 | Make random tables notes, and let the GM roll behind its screen |
| #181 | 2026-07-28 | Stop the observer holding the turn hostage |
| #182 | 2026-07-29 | Make folders the way into the library |
| #183 | 2026-07-29 | Keep leaked tool-call markup out of the story |
| #184 | 2026-07-29 | Match leaked tool-call markup by shape, not by spelling |
| #185 | 2026-07-29 | Hand DeepSeek's thinking back to it with the tool calls it made |
| #186 | 2026-07-29 | Have OCR imports write table notes, not custom tables |
| #187 | 2026-07-30 | Keep tables the model wrote in the wrong shape, and stop a missing list failing a page range |
| #188 | 2026-08-03 | Give the GM a second oracle that answers "what is going on here" |
