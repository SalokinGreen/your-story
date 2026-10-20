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

1. **Supabase and auth are gone** (removed 2026-07-21, PR #64; package dropped
   in `4800dd7`). The app is fully local-first with optional encrypted
   cross-device sync via a Cloudflare Worker. `CLAUDE.md`'s "Auth and BYOK"
   section, its env-var list, `README.md` and `docs/getting-started.md` all
   still describe Supabase.
2. **Confirmed bug: GM countdown timers with `auto_advance` never tick.**
   The only auto-tick code is gated on a tool (`end_gm_thinking`) the GM can
   no longer call. Front "doom clocks" are therefore inert. See [§6.1](#61-timer-auto-advance-never-fires).
3. **Release blocker:** `app/misc/primaMateria.ts` contains word tables
   transcribed verbatim from a commercial product without permission (the
   code says so itself). Must be resolved before any public release. See [§7](#7-release-blocker-prima-materia-tables).
4. **Four branches hold unmerged work.** Two are superseded (abandon); two
   contain things worth salvaging by hand (a lint ratchet + real React bug
   fixes; and a `take_rest` removal that needs a product call). See [§8](#8-stranded-branches).
5. **Two critical advisories ship to production** (`next`, Capacitor) and both
   clear with in-range minor bumps.

**Suggested order of work** (detail in [§16](#16-recommended-plan-for-the-next-session)):
security bumps → PR CI with a lint ratchet → fix the timer bug and the React
render bugs → refresh `CLAUDE.md`/README → dead-code sweep → product
decisions (`take_rest`, Prima Materia) → roadmap features.

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

---

## 7. Release blocker: Prima Materia tables

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
| Deprecated struct fields | `structs.ts` (11 `deprecated` markers) | Back-compat for old saves — keep, but don't build on them. |

---

## 11. What's live today — feature inventory

<!-- INVENTORY -->

---

## 12. Documentation drift

<!-- CLAUDEMD -->

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
- **Supabase removal:** PR #64 (`3348a4a`, Jul 21) "Remove dead Supabase-backed
  routes and auth stub for full-local pivot"; `4800dd7` dropped the package.
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
- **Web hosting:** Vercel (`@vercel/analytics`, `@vercel/speed-insights`;
  `sync-worker/README.md` calls it "the Vercel testing deployment"); the
  production domain appears to be `your-story.io` (it is in the sync worker's
  `ALLOWED_ORIGINS`). Deployment state unverified from here.
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
4. **Native apps** — are desktop/mobile builds still a goal? If yes: run
   `build-apps.yml` once and decide on code-signing; if no, consider removing
   `src-tauri/`, `android/`, `ios/` and the Capacitor/Tauri deps.
5. **Frontier 1 (NPCs as agents)** and **H6/H8** — explicitly gated on owner
   approval by the design docs.
6. **Branch cleanup** — OK to delete ~100 merged remote branches?

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
3. **Timer auto-advance fix + `end_gm_thinking` removal** *(medium)* —
   [§6.1](#61-timer-auto-advance-never-fires). Add a test that an `auto_advance`
   timer ticks once per completed GM turn and triggers at 0. Consider folding
   in [§6.2](#62-storythreadlinkedtimerid--threshold-are-never-written)
   (`linkedTimerId`).
4. **React render bugs** *(small)* — [§6.3–6.5](#63-goalstsx-mutates-storydata-during-render--random-keys),
   delete `SkillTreeEditor`/`SkillTreeView`, `eslint --fix` for `prefer-const`;
   lower the ratchet baseline.
5. **Docs refresh** *(small, no code)* — rewrite the stale parts of `CLAUDE.md`
   per [§12](#12-documentation-drift) (auth/Supabase/env vars, API routes, directory map,
   tool list, add Observer / multiplayer / sync / native / Prima Materia /
   campaign-plan sections); rewrite `README.md`; fix `docs/getting-started.md`;
   mark `VERCEL_AUTH_FIX.md`, `ENCRYPTION_IMPLEMENTATION.md`,
   `docs/story-encryption.md` and the `*.sql` files as historical (or move them
   to `docs/archive/`); update `architecture-frontier.md`'s Frontier 6.
6. **Dead-code sweep** *(medium)* — challenge system B, duplicate `take_rest`,
   `mythic.ts` local `AGMTState`, `parseDifficulty`, unused imports
   ([§10](#10-dead-code)).
7. **Product decisions** ([§15](#15-decisions-that-need-the-product-owner)) — then act on `take_rest` and Prima Materia.
8. **Roadmap** — `ask_question` spotlight gap → per-chapter tension target +
   sparkline → NPC-scoped reflection ([§9.1](#91-the-frontier-docs-if-you-only-do-three-things-next)).
9. **Later / opportunistic** — split the 5k-line files (`page.tsx`,
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
