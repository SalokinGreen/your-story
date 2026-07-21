# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Your Story is a Next.js 16 (App Router) + React 19 + TypeScript app: an AI-powered,
choice-driven interactive fiction / TTRPG platform. An LLM acts as a **GM (Game
Master)** that narrates and calls tools; a deterministic engine on the frontend
executes those tools against a single JSON game-state blob (`StoryData`). The
guiding principle stated throughout the docs is **"LLM proposes, deterministic
engine disposes"** — narration and tool *requests* come from the model, but dice
rolls, state mutation, and pacing decisions are deterministic code the model
cannot override.

The app has gone through a large architectural shift (documented in
`docs/five-layer-architecture-changelog.md`) from a "video-game stat block"
design (fixed RPG systems, structured inventory/conditions/XP) to a "tabletop GM
keeping freeform notes" design. **When in doubt about what's current, trust
`app/misc/structs.ts` and recent git history over prose docs** — several docs
(notably `.github/copilot-instructions.md` and `docs/architecture.md`) describe
older iterations of the app and contain stale claims; this has happened
repeatedly (see git log for `docs/game-mechanics.md`). `docs/game-mechanics.md`
and `docs/five-layer-architecture-changelog.md` are kept current and are the
best starting docs.

## Commands

```bash
npm run dev              # Next dev server (localhost:3000)
npm run build             # Production build
npm run start             # Start production server
npm run lint               # ESLint (eslint-config-next); use `npm run lint -- --fix` when safe
npm run test                # Run full Vitest suite
npm run test <substring>    # Run test files matching a name, e.g. `npm run test rpgSystems.core`
npm run test -- --watch     # Watch mode
npm run test -- --coverage  # Coverage
```

Tests live in `tests/*.test.ts`, run under `vitest.config.ts` (node
environment, `tests/setup.ts` setup file, `@/*` path alias). There is no
separate typecheck script; use `npx tsc --noEmit` if you need one. Node LTS >=
18.

Required env vars for a working `.env.local` are listed in
`docs/getting-started.md`; the important ones: `DEEPSEEK_API_KEY` or
`OPENROUTER_API_KEY` (BYOK story generation), `MISTRAL_API_KEY` /
`DEEPINFRA_API_KEY` (server-side "Coins" mode + TTS/STT), and the Supabase
quartet (`NEXT_PUBLIC_SUPABASE_URL`/`KEY`, `SUPABASE_URL`/`KEY`,
`SUPABASE_SERVICE_ROLE_KEY`).

## Architecture

### Generation is frontend-centric; the backend is a thin AI proxy

All prompt construction, context budgeting, and tool execution happens in the
browser. `app/misc/generation.ts` (`generateStoryTurn()`) drives the turn,
called from `app/story/page.tsx`. Despite the "Stage 0.5"/"Stage 1" labels
left over from an earlier redesign (when narration used to run first), the
GM/tool stage always runs **before** the story stage now:

1. **GM/tool stage** — `buildGMStagePrompt()` (`app/misc/ai_staged.ts`),
   looped via `POST /api/generate`/`/api/generate-stream` + `executeTools()`
   (`app/misc/toolExecutor.ts`) until the model stops calling tools. This is
   the "brain": it reads the character sheet and mechanics notes (see below)
   and decides on rolls/state changes, budgeted by the Memory Size slider
   (localStorage `maxContextSize`, default 128k, 60% history / 40% info).
2. **Story stage** — the "translator"/narrator. If the GM's own final round
   already wrote prose (no tool call that round), that content *is* the
   story and no second API call happens. Otherwise the same conversation is
   continued with a short prompt (`buildStoryContinuationPrompt()`) asking
   the model to narrate now, streamed via `POST /api/generate-stream` — same
   model, same context, no separate prompt built from scratch. There is no
   standalone story-prompt builder anymore; the old `buildStoryPrompt()`
   (used only for retries and as a last-resort fallback) was removed.
3. **Choices stage** — `buildChoicesPrompt()` parses the next set of player
   choices from the model's output.

`app/api/generate/route.ts` and `app/api/generate-stream/route.ts` are dumb
proxies: they take `{ messages, tools?, model, ... }`, forward to whichever
provider the model name implies (DeepSeek, OpenRouter, Mistral, DeepInfra),
and return/​stream the raw result. They do **not** know about
`StoryData`, prompts, or tools — all of that logic lives in `app/misc/`.

Reasoning-tier/model selection per turn is automatic:
`app/misc/reasoningTiers.ts` picks `(model, reasoning_effort)`; users don't
manually pick a model per stage.

### The GM is tool-calling, not a fixed dice system

There is **no `rpgSystem` picker and no structured stat-block engine anymore.**
The GM improvises dice mechanics per-adventure by reading a `mechanics`-type
lore note and a `character_sheet`-type lore note (freeform text — "notes, not
stat blocks"), then calls tools such as:

- `formula_roll` / `opposed_formula` / `formula_challenge_check` — all dice
  resolution goes through these; supports `reverse_dc` (roll-under systems),
  `stakes` (low/medium/high/deadly), per-outcome `consequences`.
- `start_challenge` / `formula_challenge_check` / `resolve_challenge` /
  `cancel_challenge` — multi-roll "best of X successes" challenges
  (`StoryData.activeChallenge`, only one active at a time).
- `fate_question` / `roll_table` — Mythic-style oracle (weighted by a 1-9
  chaos factor) and random tables.
- `start_combat` / `add_combatant` / `update_combatant_stat` /
  `toggle_combatant_condition` / `npc_roll` / `advance_turn` / `end_combat` —
  turn-based combat with its own per-combatant stat blocks, independent of the
  player's character sheet.
- `take_rest` — quick/short/long rest, restores resources per the adventure's
  rest config; blocked during an active challenge.
- `create_thread`/`update_thread`/`resolve_thread`/`abandon_thread` (open
  plotlines) and `create_goal`/`update_goal`/`complete_goal`/`fail_goal`/
  `delete_goal` (player-facing objectives) — these are what quests/achievements'
  functionality now lives in. **No points/XP are attached to any of this.**
- `manage_timer` — countdown timers for deadlines.
- `read_notes`/`search_notes`/`create_note`/`edit_note`/`delete_note` and the
  `edit_lore_*`/`merge_lore`/`duplicate_lore` family — the GM's primary way of
  reading/updating lore, secrets, the character sheet, and the mechanics note.
- `add_memory`/`search_memory` — durable recall, searched rather than replayed.

Tool execution happens locally via `app/misc/toolExecutor.ts`
(`executeTools()`), which mutates `StoryData` directly and returns
`{ responses, stateChanges }`. As of the latest refactor most tools dispatch
via typed functions rather than a string-serialize/regex-parse round trip.

**Removed/deprecated systems — do not build new features assuming these are
live** (see `docs/game-mechanics.md` "What Changed" for the full list and
rationale):
- Momentum (reroll/guarantee-success currency) — gone.
- The 8-system RPG picker (3d6/1d20/1d100/percentile/PbtA/Fate/YZE/Explosive)
  and its client-side advantage/disadvantage — gone; `rpgSystems.ts` only
  exports a few generic parsing helpers now.
- Structured `Stat[]`/`Resource[]` editors and `InventoryItem[]` (items, tools
  like `add_item`/`break_item`, the Inventory tab) — gone; describe these in
  the character sheet note instead. `Choice.item_used` still reads legacy
  `inventory` on old saves for backward compat only.
- `Condition[]` (tiered status effects) — gone; injuries are now narrative
  prose or `formula_roll` consequences. (`toggle_combatant_condition`, the
  combat-only status toggle, is unrelated and still live.)
- `Achievement[]`, `Quest[]`, and the entire XP/leveling economy
  (`points`/`level`/`upgradesSpent`) — gone; replaced by Goals + Story
  Threads with no points attached.
- `Ability[]` — **soft-deprecated**: tools still work for backward
  compatibility, but new adventures should describe abilities in the
  character sheet note; `buildInfoMessage` already treats abilities like
  stats/resources.
- `Passives` — gone (never actually affected mechanics).

Old saves keep these fields for backward compatibility; the GM doesn't read
them and the UI doesn't expose them.

### Data model

`app/misc/structs.ts` is the single source of truth for all shapes —
`StoryData`, `Scene`/`ScenePart`, `Choice`, `StoryLore` (with `type:
"lore"|"character_sheet"|"mechanics"`, and dynamic on/off triggers),
`MemoryEntry` (string or `{content, embedded}` — use `getMemoryContent()`),
`NPC`, `StoryThread`, `Goal`, `CountdownTimer`, `SceneChallenge`,
`AGMTState` (tension/director state), etc. Fields explicitly marked
`DEPRECATED` in comments are backward-compat only — grep the file for
`DEPRECATED`/`deprecated`/`@deprecated` before assuming a field is live.

Story rendering uses a **spread-props pattern**: `<Story {...storyData} />`,
with `Story(storyData: StoryData)` as the component signature — props are
`StoryData` fields directly, not nested. Preserve this unless refactoring all
call sites.

### Five-layer AI-GM architecture (for anything touching pacing/memory/consistency)

Framed by two internal research-informed docs
(`docs/five-layer-architecture-changelog.md`,
`docs/architecture-frontier.md`) as: **(1) state** (`StoryData`, tool-mediated
only), **(2) oracle/entropy** (`diceFormula.ts`, Mythic chaos factor),
**(3) director/pacing** (`AGMTState.tension`, `selectDirectorMove()` — a
deterministic policy choosing from a bounded PbtA-style move menu; the model
narrates the chosen move, never picks it), **(4) memory** (`MemoryEntry` with
timestamp/sceneIndex/entityIds/importance, semantic reranking, periodic
`reflection.ts` synthesis), **(5) adjudication** (`checkNarrationConsistency()`
in `consistencyCheck.ts` — narrow, non-blocking dead-NPC-narrated-as-present
checks; the M2 roll-invariant gate that forces a re-prompt if a gated scene
ends with no roll). Read `docs/architecture-frontier.md` before proposing new
work in any of these layers — it tracks what's already been tried/reverted and
why (e.g. `activate_downside` was reverted for depending on soft-deprecated
`Ability` data).

### Auth, tokens ("Coins"), and BYOK

- Supabase Auth; `app/misc/AuthContext.tsx` (`useAuth()`), `app/misc/auth.ts`.
- Two ways to pay for AI generation: **BYOK** (user supplies their own
  OpenRouter/DeepSeek key, no coin cost, gated to paid subscribers via
  `hasByokAccess` — currently force-`true` for everyone since Stripe purchase
  flows were removed) and **Coins** (server-side key for Mistral/DeepInfra
  models, deducted via `app/misc/tokens.ts`, 2.5x markup via
  `MARKUP_MULTIPLIER`).
- **Stripe purchasing is removed** (checkout/webhook/portal routes and their
  UI are gone) — only the free tier is reachable in practice; the coin ledger
  itself is still live and still deducts per generation call.
- Two DB-level auth patterns: user-context calls use
  `NEXT_PUBLIC_SUPABASE_URL/KEY` + RLS + a validated `Authorization: Bearer
  <token>` header (`authenticatedFetch()` in `app/misc/getAuthToken.ts`);
  admin operations use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS after
  verifying admin status. Follow this split for any new API route touching
  user data.

### Directory map (condensed — see `.github/copilot-instructions.md` for an
exhaustive per-file breakdown, keeping in mind some of its mechanics claims
are stale per the "Removed/deprecated systems" list above)

- `app/misc/` — nearly all core logic: prompt builders (`ai_staged.ts`,
  `ai.ts` legacy/non-staged path, `creator_ai.ts`, `story_creator_ai.ts`,
  `big_adventure_ai.ts`), tool schemas/execution (`toolSchemas.ts`,
  `toolExecutor.ts`, `gmTools.ts`, `gmExecutor.ts`), game logic
  (`diceFormula.ts`, `mythic.ts`, `mythicChaos.ts`, `compaction.ts`,
  `reflection.ts`, `consistencyCheck.ts`, `embeddings.ts`), auth/tokens
  (`auth.ts`, `tokens.ts`, `getAuthToken.ts`), local-first managers
  (`localStoryManager.ts`, `localAdventureManager.ts`, `localFolderManager.ts`,
  `localPDFImportManager.ts`) for offline/optimistic story storage.
- `app/api/` — thin route handlers: AI proxies (`generate`,
  `generate-stream`), content CRUD (`stories`,
  `adventures`, `folders`, `comments`), tokens/subscriptions, `creator/*`
  (multi-stage full-adventure generation with JSON-repair fallback), `tts`,
  `stt`, `ocr`, `embeddings/*`.
- `app/story/` — gameplay UI: `page.tsx` (state/orchestration shell),
  `story.tsx` (presentational), `menu.tsx` (in-story editor), `stats.tsx`,
  `lore.tsx`, `npcs.tsx`, `upgrades.tsx`.
- `app/creator/` — adventure authoring UI (`page.tsx`, `manual/` step wizard,
  `generate/`).
- `app/library/` — story/adventure browsing, search/filter/sort, folders.
- `app/components/` — shared UI components (dice visualizer, character sheet
  renderer/editor, TTS/STT controls, API key modal, etc.)
- `tests/` — Vitest unit/integration tests, largely targeting `app/misc/*`
  logic (dice, tool validation, lore triggers, memory dedup, consistency
  checks, campaign-regression scenario). Deterministic tests seed
  `Math.random` — follow that convention for new dice/oracle tests.
- `docs/` — a large, mixed-freshness set of design docs and one-off SQL
  migrations. Prefer `game-mechanics.md`, `five-layer-architecture-changelog.md`,
  `architecture-frontier.md`, `api-reference.md`, `testing.md` over
  `architecture.md`/`ai-integration.md`/`choice-system.md`, which describe an
  older, more mechanical version of the app. `*.sql` files are one-time
  migrations to run manually in the Supabase SQL editor, not part of an
  automated migration pipeline.

## Conventions

- TypeScript strict mode; no `any`. Path alias `@/*` → repo root
  (`import { StoryData } from "@/app/misc/structs"`).
- Tailwind v4: use `bg-linear-to-*` for gradients, not the v3
  `bg-gradient-to-*` syntax.
- Client components only get `"use client"` when they actually need it; App
  Router server components are the default.
- Toasts: `addNotification("message", "success"|"failure"|"warning")` via
  `NotificationContext`.
- Don't change `structs.ts` interfaces without updating every usage and
  `starter_stories.ts`.

## Workflow expectations for this repo

Per `.github/copilot-instructions.md`: discuss the approach and get explicit
confirmation before making codebase changes — don't create, modify, or delete
files without user sign-off first.
