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
`docs/getting-started.md`, but AI generation itself needs none of them —
provider keys are BYOK and live in the browser (Settings → API keys). The
server-side vars that still matter are the Supabase quartet
(`NEXT_PUBLIC_SUPABASE_URL`/`KEY`, `SUPABASE_URL`/`KEY`,
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

- `formula_roll` / `opposed_formula` — all dice resolution goes through
  these. **They report what the dice showed and never judge it**: no tool
  takes a `dc`, and `calculate` is what turns a roll into a verdict (see
  below). `formula_roll` takes `formulas: string[]`, one entry per
  *independent* pool, so a system that rolls dissimilar dice against each
  other (Starforged: `["1d6+2", "2d10"]`) gets separate totals with nothing
  summed across them — and every die in the call is thrown in one physical
  toss. Supports `stakes` (low/medium/high/deadly), per-outcome
  `consequences` (both branches echoed back, since the engine doesn't know
  which one landed), and the `target`/`forces_choice` hardness dimensions.
- `calculate` — math *and comparisons*: `'17+3 >= 15'` comes back TRUE/FALSE.
  This is the only place a pass/fail verdict is decided, so every check is
  two steps (roll, then compare). Its `success` carries the verdict, the way
  the dice tools' DCs used to.
- `start_challenge` / `record_challenge_result` / `resolve_challenge` /
  `cancel_challenge` — multi-roll "best of X successes" challenges
  (`StoryData.activeChallenge`, only one active at a time). A check inside
  one is three calls: `formula_roll` → `calculate` → `record_challenge_result`
  (which rolls nothing and just banks the outcome).
- `fate_question` / `roll_table` — Mythic-style oracle (weighted by a 1-9
  chaos factor) and the ~40 **built-in** element tables. The adventure's own
  tables are not rolled here: they're `StoryLore` notes with `type: "table"`
  that name a die and list its results in prose, and the GM rolls them itself
  with `formula_roll` after reading the note.
- `gm_roll` — a roll behind the GM's screen, for checks where the player
  knowing a roll happened is itself the spoiler (hidden Perception, whether a
  lie lands, offscreen events). Always digital (never routed to the physical
  dice tray) and filtered out of the player-visible tool log and turn
  timeline via `hiddenFromPlayer`. Ordinary player-declared actions stay on
  `formula_roll`.
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
- `CustomTable[]`/`StoryData.customTables` (structured `{text, weight}`
  tables, `rollOnCustomTable`, the in-story Tables tab, the Designer's
  `write_tables`/`delete_tables`, and the separate Tables Library) — gone;
  tables are `type: "table"` notes. Old data converts on load via
  `tableNotes.ts` (stories/adventures) and `tablesLibraryMigration.ts` (the
  library). The interfaces survive in `structs.ts` as deprecated read-only
  back-compat for that conversion; nothing writes them — the PDF/OCR importer
  extracts `tableNotes` (notes, not structured tables) too, and only
  *converts* a legacy-shaped table if a model answers with one.

Old saves keep these fields for backward compatibility; the GM doesn't read
them and the UI doesn't expose them.

### The creator is conversational — a Game Designer, not a Game Master

Authoring an adventure means talking to a **Game Designer** AI, a deliberately
different character from the play-time GM. The GM runs a story for a player and
never breaks fiction; the Designer talks to the *author* about the adventure as
a designed object and writes the material the GM later improvises from. Prompt
lives in `app/misc/designer_ai.ts`.

The pieces:

- `designer_tools.ts` — 12 tools, all targeting things the GM actually reads:
  `set_adventure_info`, `set_premise`, `write_note`/`delete_note` (one tool for
  every `LoreType`, including the mechanics note, the character sheet and
  random tables), `write_npcs`, `write_goals`, `set_starting_choices`,
  `write_presets`, `set_character_sheet_template`, plus deletes.
- `designer_executor.ts` — the deterministic half. Owns `AdventureDraft` (a
  flat working shape), applies tool calls to a *copy* so a malformed call can't
  corrupt the draft, and converts to/from `Adventure` via
  `draftToAdventure`/`adventureToDraft`. It also overrides the model where
  correctness demands it: `mechanics` and `character_sheet` notes are always
  forced `alwaysOn`, because the GM can't run the game if the rules are only
  keyword-triggered.
- `useDesignerSession.ts` — the bounded tool loop (max 5 rounds/turn), the
  chat transcript, IndexedDB save, and `importFromLibrary()`, which merges
  notes picked from the global notes library (`LibraryPickerModal`,
  shared with story start and the in-game lore editor) into the draft — tables
  come through here too, as `type: "table"` notes. Imports
  dedupe on `libraryNoteId` so re-importing updates in place;
  the Designer learns about imported material through `summarizeDraft()`, not
  through the transcript. The creator offers this on opening a blank adventure
  and from the header's Import button at any time.
- `AdventureInspector.tsx` — hand editing. The AI's tools and the inspector
  write to the same draft, and `summarizeDraft()` re-injects live state into
  the system prompt each turn, so the Designer sees the author's manual edits
  and is told to treat them as authoritative.

The old creator — a 12-step manual wizard, a staged batch generator
(`big_adventure_ai.ts`, `generation_orchestrator.ts`), `creator_tools.ts`,
`creator_ai.ts`, `story_creator_ai.ts`, and the `CreatorAIChat` sidebar — is
**deleted**. Don't restore it or write new code against those modules. It had
drifted badly: it still authored `abilities`, `skillTrees`, `variables`,
`relationships`, and `upgradeSettings`, none of which the GM reads. Generic
JSON-repair helpers from the batch generator survive in `jsonRepair.ts`
because the OCR pipeline uses them.

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

### Auth and BYOK (Coins are gone)

- Supabase Auth; `app/misc/AuthContext.tsx` (`useAuth()`), `app/misc/auth.ts`.
- **AI generation is BYOK, always.** The user supplies their own key for every
  provider (OpenRouter, DeepSeek, Google, Mistral, DeepInfra, plus the TTS/STT
  providers), stored in localStorage and read via `useAPIKeys()`
  (`APIKeysContext.tsx`). Clients forward all five provider keys on every
  `/api/generate`(`-stream`) call and the proxy picks the one the model's
  provider needs. `getAvailableModels()` in `ai_prices.ts` is the shared
  "which models can this user actually call" helper — a model is offered when
  its provider's key is saved, optionally filtered to tool-calling models.
- **Coins are fully removed.** There is no coin ledger, no server-side
  provider key, no markup: `app/misc/tokens.ts`, `/api/tokens`,
  `/api/subscriptions`, `MARKUP_MULTIPLIER`/`COINS_PER_DOLLAR`, the coin cost
  helpers and `MODEL_PRESETS` are all gone, and Mistral/DeepInfra are ordinary
  BYOK providers like the rest. Cost figures shown in the UI (`turnCost.ts`,
  `TurnCostPanel.tsx`, the image-model pickers) are real dollar estimates
  against the user's own key. Don't reintroduce a coin/credit concept.
- **Stripe purchasing is removed** (checkout/webhook/portal routes and their
  UI are gone) — there is nothing to buy.
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
  `ai.ts` legacy/non-staged path, `designer_ai.ts` for the authoring-side
  Game Designer), tool schemas/execution (`toolSchemas.ts`,
  `toolExecutor.ts`, `gmTools.ts`, `gmExecutor.ts`), game logic
  (`diceFormula.ts`, `mythic.ts`, `mythicChaos.ts`, `compaction.ts`,
  `reflection.ts`, `consistencyCheck.ts`, `embeddings.ts`), auth/tokens
  (`auth.ts`, `tokens.ts`, `getAuthToken.ts`), local-first managers
  (`localStoryManager.ts`, `localAdventureManager.ts`, `localFolderManager.ts`,
  `localPDFImportManager.ts`) for offline/optimistic story storage.
- `app/api/` — thin route handlers: AI proxies (`generate`,
  `generate-stream`), content CRUD (`stories`,
  `adventures`, `folders`, `comments`), tokens/subscriptions,
  `creator/generate-image`, `tts`, `stt`, `ocr`, `embeddings/*`.
- `app/story/` — gameplay UI: `page.tsx` (state/orchestration shell),
  `story.tsx` (presentational), `menu.tsx` (in-story editor), `stats.tsx`,
  `lore.tsx`, `npcs.tsx`, `upgrades.tsx`.
- `app/creator/` — adventure authoring UI. A conversation with a **Game
  Designer** AI (`page.tsx` shell, `DesignerChat.tsx`,
  `AdventureInspector.tsx` for hand edits, `useDesignerSession.ts` for the
  draft + tool loop). See "The creator is conversational" below.
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
