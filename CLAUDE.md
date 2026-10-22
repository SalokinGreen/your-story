# Working notes for Claude

`README.md` is stale (it still describes Supabase, auth and coins). **The
state of the project is
[`docs/status-report-2026-10-20.md`](docs/status-report-2026-10-20.md)**: the
audit after eleven idle weeks, with dated update notes where something it
lists has since been fixed. Its §6 is the bug list, §11 what is live, §12
what the old docs got wrong, §16 the recommended order of work.
[`docs/decisions.md`](docs/decisions.md) is the author's decision log —
every answer is a numbered decision, and plans and PRs cite the numbers.
[`docs/pending_tests.md`](docs/pending_tests.md) holds the checks no
session could perform. [`docs/workflow.md`](docs/workflow.md) is the
working loop. The docs that can be trusted are
[`game-mechanics.md`](docs/game-mechanics.md) (minor drift),
[`five-layer-architecture-changelog.md`](docs/five-layer-architecture-changelog.md),
[`architecture-frontier.md`](docs/architecture-frontier.md) (its Frontier 6
predates online multiplayer), [`gm-plan-notes-design.md`](docs/gm-plan-notes-design.md),
[`prima-materia.md`](docs/prima-materia.md),
[`dice-visualization.md`](docs/dice-visualization.md),
[`tts-integration.md`](docs/tts-integration.md) and
[`sync-worker/README.md`](sync-worker/README.md). The rest of `docs/`
describes older iterations of the app — check the status report's §12.3
before trusting one. `.github/copilot-instructions.md` is far staler still.

**What landed after the audit (2026-10-20/21, PRs #190–#201):** the critical
`npm audit` advisories cleared (#190); every AI side call through
`callSideModel()`, so compaction, reflection, the Observer, the Memory
Keeper and the Designer run with default settings and in the native apps
(#191); the PWA and Vercel analytics removed (#192); `tauri build` working on
Windows (#193); stories from Designer-made adventures no longer crashing
(#195); the GM's history budget no longer negative on the heavy tiers
(#197); the terms page rewritten (#199); the copied Prima Materia tables
stripped (#200); a text invite and system-browser OpenRouter sign-in in the
native apps (#198, #201). **Still open from §6:** `auto_advance` timers never
tick (6.1), Fronts never linked to their clocks (6.2), random ids and keys
during render (6.3–6.5), the dead Embeddings toggle (6.9), tools the GM
cannot call (6.10), online guests receiving the GM's secrets (6.12), and the
stale Google tool filter, which leaves session zero unable to end on Gemini
(6.14). Four more were found on 2026-10-22 (decision 65): rules notes listed
by title only while the prompt, comments and docs say pinned (6.15), hidden
note text reaching the narrator (6.16), `calculate` evaluating `min(12,10)`
as 1210 (6.17), and `search_notes` returning disabled notes (6.18); and
three from the token measurements: a thinking-only turn saving an empty
story (6.19), story falling between the history window and the summary
(6.20), and memory trimming upsetting reflection's index (6.21). There is
still no CI on pull requests.

**The product is the native apps (decision 1).** Tauri desktop and Capacitor
Android/iOS, packaged from the `NEXT_PUBLIC_STANDALONE=true` static export.
There is no public website; the Vercel deploy is a testing vehicle. A change
that only works on the web build is broken.

This file is for how to work here, plus the architecture facts a session
needs so it does not build on a system that was deleted.

## What this app is

Your Story is a Next.js 16 (App Router) + React 19 + TypeScript app: an
AI-powered, choice-driven interactive fiction / TTRPG platform. An LLM acts
as a **GM (Game Master)** that narrates and calls tools; a deterministic
engine on the frontend executes those tools against a single JSON game-state
blob (`StoryData`). The guiding principle is **"LLM proposes, deterministic
engine disposes"**: narration and tool *requests* come from the model, but
dice rolls, verdicts, state mutation and pacing decisions are code the model
cannot override.

The app went through a large shift (documented in
`docs/five-layer-architecture-changelog.md`) from a "video-game stat block"
design — fixed RPG systems, structured inventory, conditions, XP — to a
"tabletop GM keeping freeform notes" design. **When in doubt about what is
current, trust `app/misc/structs.ts` and recent git history over prose
docs.** Adventures are authored in conversation with a **Game Designer**
AI, a different character from the GM. Keys are always the player's own
(BYOK); there are no accounts, and a player's data lives on their device
(optional cross-device sync keeps only encrypted copies on the server).

## The working loop

[`docs/workflow.md`](docs/workflow.md) is the author's plan → implement →
verify loop; §10 maps it onto this repository. The things from it that change
what a session actually does:

- **Plan to a file, then implement in a fresh session.** A design document in
  `docs/` is the handoff, not the planning conversation. In the desktop app
  the fresh session is a session card whose brief points at the plan file.
- **No coding without the author's explicit blessing on the plan.** Writing
  the design document is not approval, and neither is the author having asked
  for the feature — the go-ahead is a separate, explicit "yes, build it"
  *after* they have read the plan. Write the design, hand it over, and end the
  session. (This rule exists because sessions kept rolling from plan into
  code, and the first implementation of a thing nobody had signed off on was
  wrong in ways the design review would have caught for free.) A change you
  could describe in one sentence needs no plan (`workflow.md` §2, "When to
  skip all of this"); a direct, specific ask from the author for that one
  change is its go-ahead.
- **A plan handed to the author gets published as an artifact.** The markdown
  in `docs/` stays the source of truth; the artifact is the reading copy, and
  the author reads that one. Hand over the link, not just the path. The
  `Artifact` tool and the `artifact-design` skill come with Claude Code in
  the desktop app and on claude.ai, not with this repository; load the skill
  before writing the page. A session without the `Artifact` tool hands over
  the markdown path and says the reading copy is owed.
- **Design and implementation planning are two documents, not one.** The
  design says what and why; the implementation plan says which files, which
  signatures, in what slice order, and what breaks. A design that names no
  file is not ready to build from — see `workflow.md` Phase 3.
- **Interview the author for the calls only they can make, and log every
  answer.** Use `AskUserQuestion` for real decisions, with a recommended
  option first. Each answer goes into [`docs/decisions.md`](docs/decisions.md)
  as a numbered decision in the same change as the work it unblocks, and the
  plan cites the number.
- **A review asked to find gaps will find them.** Triage any such list against
  *does this affect correctness or a stated requirement* before building from
  it. Implementing every finding is over-engineering wearing thoroughness as a
  coat.
- **Evidence, not assertions.**
- **Broad exploration goes to a subagent, without asking** — tracing a
  subsystem, hunting every call site, auditing docs against code. A known file
  at a known path does not. The `code-explorer` agent is set up for it.
- **Code the whole approved slice plan without stopping between slices.** Stop
  and ask only for a genuine big problem — the plan contradicts what the code
  does, a check fails for an unclear reason, or a slice needs a call the plan
  left open and getting it wrong would be expensive to unwind. Anything
  smaller — a signature that had to change shape, a helper the plan didn't
  name — is a judgment call: make it, then record it in a dated "Decisions
  made during implementation" section at the bottom of the plan file, and
  mention it in the end-of-session summary.

## Delegating to subagents and other sessions

Delegation runs on Claude agents (decision 9 — the Kilo bridge did not come
over). The agents live in `.claude/agents/`.

| delegate to | for |
|---|---|
| `code-explorer` (Haiku) | tracing a subsystem, hunting call sites, auditing docs against code: read-only, and cheap enough to read widely |
| `researcher` (Haiku) | web research (docs, APIs, prices, terms of service), as sourced facts with links |
| `implementer` (Sonnet), or a fresh session started with `model: "claude-sonnet-5-5"` | building a change that has *already been planned*, one slice or one PR at a time; specified work is Sonnet work (`workflow.md` §3) |
| `docs-writer` (Haiku) | writing or updating docs for work that already exists |
| `engine-review` (Opus) | reviewing any change to the engine in `app/misc/` before it merges, against the bug families this codebase keeps producing |
| the `/code-review` skill | a correctness review of the current diff in a fresh context |
| the `codex-review` skill | a second opinion from a different model family on a plan or a diff, when the author asks for one |
| `fable-escalation` (Fable) | a problem you have genuinely tried and failed to solve — attempted, verified to fail, not merely tedious. Not a first resort |

**Every delegation names its model.** A session started with
`start_session`, and a `general-purpose` or `Explore` subagent, inherit the
caller's model unless they are given one. Here that means Opus, the most
expensive one. So pass the model explicitly every time, or use an agent from
the table above, which has its model pinned:

- **Sonnet** (`claude-sonnet-5-5`) for building and fixing from a clear brief.
- **Haiku** (`claude-haiku-5-5`) for docs, research, exploration and
  mechanical edits.
- **Opus** only for planning, design and reviews.

If a running session is on the wrong model, switch it with
`set_session_model`. (On 2026-10-21 every session and research agent
inherited Opus, and the author caught it: "I think you're only using
yourselves, opus, which costs a lot.")

**Keep, and do not delegate:** the implementation plan itself, and the
before-and-after baseline. The plan is where being wrong is most expensive,
and a baseline cannot be checked by the model that made the change.

**Delegate at genuine decision points, not reflexively.** Each delegation
loads its own context before any thinking happens, so a trivial delegation
costs about what a real one does. Small edits are cheaper done directly than
described precisely enough to hand over.

**A delegated worker cannot see this conversation.** It gets its brief and
nothing else. A brief that reads clearly to you and omits what you decided
three messages ago will produce confidently wrong work. Name the files, the
decisions (by number) and what done looks like.

**Review the diff before trusting it.** Workers write to the working tree or
to their own branch; read what they did before reporting it as done, and
check their test claims against the actual output.

**One owner per piece of work.** On 2026-10-21 two sessions each fixed the
same two bugs, because a session started fix sessions for work its parent had
already proposed; two PRs had to be closed. Before starting a session, check
the linked sessions; a session started for one task does not start sessions
for work it did not originate.

## What a cloud session cannot do

Sessions run in two very different places, and the difference is not cosmetic:

| | the author's machine | a cloud session |
|---|---|---|
| `npm ci`, the Vitest suite, `tsc`, `eslint`, both Next builds | yes | yes (the SessionStart hook runs `npm ci`) |
| the browser preview and screenshots | yes | **no** |
| the Tauri desktop build and launching it (Windows, Rust ≥ 1.90) | yes | **no** |
| an Android build | **no** (no SDK here) | **no** — `build-apps.yml`, with the author's go |
| an iOS build | **no** (no Mac) | **no** — `build-apps.yml`, with the author's go |
| calls to a real model | **only with the author's go** — the keys are theirs and every call costs money | **no** — no keys, and none may be added |

So a cloud session can test every line of the engine and build the static
export — and still cannot see the app run, or run it as the product. Anything
that only shows up on screen, in a native shell or with a live key is
unverified when it is pushed, and the honest thing is to say which parts
those are rather than to let "it builds" stand in for "it works".

**Never claim something was tested when it was compiled.** `next build`
succeeding says nothing about whether the desktop app can reach a provider.

**The rule has two halves, and the first one is the one that gets skipped:**

**1. If you can run the tools, RUN THEM.** On the author's machine the
preview, `tauri build` and the built app are right there. Writing a check
into `pending_tests.md` that you could have performed yourself is not honesty
about your limits — it is handing the user your homework. The file is for
work that was *impossible*, never for work that was merely extra effort. If
you are on this machine and you touched anything that reaches a screen, take
the screenshot before you write the summary.

**2. If you genuinely cannot** — no display, no native toolchain, no device,
no key — append what you could not verify to
[`docs/pending_tests.md`](docs/pending_tests.md) before finishing, and say so
in the summary.

- Write them as checks a person performs, with the expected result — not as a
  list of files touched. "Paste the code from openrouter.ai into the desktop
  app; the OpenRouter key should show as saved and a turn should reach
  OpenRouter" is a test. "Verify OAuth" is not.
- Note what the failure would look like where it is predictable. Half the
  value is turning an hour of confused poking into a glance.
- Group under a dated heading per session, newest at the top.
- A session **on** the author's machine works the list down and deletes what
  it confirms. Entries only ever leave the file by being tested, not by
  ageing out.

## Running the app on the local machine

The `verify` skill has every command and how to read it. The things that bite:

- **A fresh worktree has no `node_modules`.** `npm ci` takes 2–6 minutes;
  run it in the background. Its postinstall patches the dice library and
  rewrites the line endings of two files under
  `public/assets/themes/default/` — check the diff is line endings only,
  then `git checkout --` them.
- **The browser preview** is `.claude/launch.json`'s `your-story-dev`
  (`npm run dev`), started through the preview tools, never through Bash.
- **The standalone build is `node scripts/build-standalone.mjs`.** The
  `NEXT_PUBLIC_STANDALONE=true npm run build` prefix is POSIX-only and fails
  under `cmd.exe` and PowerShell.
- **The desktop build is `RUSTUP_TOOLCHAIN=1.99.1 npx tauri build`.**
  `src-tauri/Cargo.toml` needs rustc ≥ 1.90 and this machine's default
  `stable` is 1.86. It can rewrite `Cargo.toml`'s line endings; revert them
  the same way. The installers land in `src-tauri/target/release/bundle/`
  and the binary is `src-tauri/target/release/app.exe`.
- **`tauri dev` does not exercise the native path**: its `beforeDevCommand`
  is plain `npm run dev`, a non-standalone build talking to `/api/*`. Only
  `tauri build` tests what ships.
- **Inside Tauri a request to a missing path returns `index.html` with
  200 OK**, so a stray `fetch("/api/...")` fails as a JSON `SyntaxError`,
  not a 404.
- **Driving a built app over WebView2's debugging port: use your own port
  and your own profile, and check who owns the port.** Several sessions run
  at once, and `--remote-debugging-port=9222` is the number everyone copies.
  A second app on the same port, or on the same WebView2 profile, leaves your
  driver talking to *another session's* app (on 2026-10-21 one created a
  stray story in a session's party-mode app). Launch with
  `WEBVIEW2_USER_DATA_FOLDER=<a short folder>` (a long path, such as the
  scratchpad's, makes IndexedDB fail with "Internal error opening backing
  store") and a port of your own, then confirm the port's owner is a
  `msedgewebview2` whose parent is your `app.exe` before sending a command.
  Close only the `app.exe` whose path is your worktree's.

## Devlogs

A devlog captures a session for someone who wasn't in it — screenshots plus
the notes that explain what they're looking at. A dated
`docs/devlog/YYYY-MM-DD-topic.md`, its screenshots in a same-named sibling
folder, taken from the browser preview or the built desktop app.

- **Keep the outline loose, and keep it during the session, not after.** Jot
  key moments and why they mattered as they happen — a bug a screenshot
  caught, a shot that turned out to prove nothing, a change with no pixels to
  show. Reconstructing it from memory at the end loses exactly the detail that
  makes a devlog worth reading over the plan doc itself.
- **Say plainly when a session wasn't visual.** "Eight of the nine slices are
  engine; none of it renders yet" is the honest shape of an engine-heavy
  session, not a failure of the devlog.
- **The author's machine only**, same as every other screenshot. Note in the
  summary that a devlog is owed rather than writing one from imagination.

## The remote

`origin` = https://github.com/SalokinGreen/your-story, and it is **public**.
Work happens on `claude/*` branches and lands through pull requests to
`master`. **Merge only when the author says so** (decision 5): `gh pr merge
--merge`, one PR at a time, pulling master and running the suite after each,
stopping on a failure or a needed rebase. A green check on a PR is Vercel's
preview deploy, not the tests.

Because the repository is public, two things never go into it: secrets
(`.env*`, any key — keys live only in the player's own storage), and text
copied from a product the project does not own (decision 3). A later commit
that deletes either does not remove it from history.

## Verification

- **Every change** runs the Vitest suite and `tsc`, with the baseline
  captured **before** editing — see the `verify` skill. A change in the test
  count is a change in what is tested; say why it moved.
- **An engine change** (anything in `app/misc/` that the GM loop, the
  executors, the oracles, the director or the side agents run) gets the
  `engine-review` agent before it merges.
- **Anything that reaches a provider, a URL or the network** gets the
  standalone build; anything that moves native configuration (`src-tauri/`,
  a Tauri or Capacitor plugin, the allowlist) gets `tauri build` and a launch.
- **A UI change** gets the browser preview and a screenshot.
- **Lint is debt, not a gate**: 587 problems on 2026-10-20 and no ratchet
  yet. Do not add to it in the files you touch.
- **Any run against a real model waits for the author to say go — flag it,
  don't run it.** The keys are the author's own, so a played turn, an eval
  against a provider or a long campaign run spends their money. Name it in
  the summary and let them decide.

## Documentation must move with the code

**Before merging, update the docs to match what the change actually did**, in
the same change. A page describing a system that no longer works the way it
says is worse than no page at all. If a merge genuinely can't include the doc
update, say so explicitly in the summary rather than letting it drift
silently.

- **The status report is a dated snapshot.** When a change fixes something it
  lists, add a dated update note under that section (as §7 has) rather than
  rewriting the report.
- **A decision goes into `docs/decisions.md`** in the same change as the work
  it unblocks.
- **This file changes with the loop.**

## Real play is the base, fiction is the sky

For any research pass that feeds a design from real material — how
tabletop GMs actually run games, actual-play recordings, GM advice, the
designs of Mythic, Ironsworn, PbtA and Blades — alongside fiction and
video games. **Ground every GM behaviour in what real play shows first, then
use fiction to find the ceiling**: the more dramatic, more legible version of
the same underlying move, not a different move. The research papers in
`docs/research-paper-*.md` are this repo's first pass at the real base.

Nobody wants a transcript of a real table when they play, so the GM has to
reach past what real sessions statistically produce. But a GM tuned only on
fiction — or on what language models write when asked to roleplay — learns
the exaggeration and the clichés, not the thing being exaggerated. Pairing a
real source against a fictional one *on the same technique* is what separates
the two.

## Methods that live as skills

- **`verify`** — the suite, the builds, and how to read their output.
- **`empty-playtest`** — when the ask is "how would players react to this" or
  "poke this system and find out what's missing." Use it; don't invent a
  lighter version.

---

# Architecture

The facts below were checked against the code on 2026-10-21. Where this
section and the code disagree, the code wins — and fix this section.

## Generation is frontend-centric; the backend is a thin AI proxy

All prompt construction, context budgeting and tool execution happens in the
client. `app/misc/generation.ts` (`generateStoryTurn()`) drives the turn,
called from `app/story/page.tsx`. Its stage labels are leftovers from an
earlier redesign — 0 (embedding retrieval, dead), 0.5 (the GM), 1 (the
story), 3 (choices), 4 (memory embedding sync, dead) — and the GM stage
always runs **before** the story stage:

1. **The GM/tool stage** — `buildGMStagePrompt()` (`app/misc/ai_staged.ts`),
   looped through the provider and `executeGMTools()` (`gmExecutor.ts`, which
   works on a `structuredClone` and hands state tools to
   `toolExecutor.executeTools`) until the model stops calling tools or hits
   `maxToolLoops` (default 10). The roll gate (M2) and the plan gate can force
   `tool_choice: "required"`. This is the "brain": it reads the character
   sheet and mechanics notes and decides on rolls and state changes. Its
   budget comes from `computeGMStageBudget()`: the Memory Size slider
   (localStorage `customMaxContext`, default `GM_STAGE_DEFAULT_BUDGET` =
   36,000), capped so the input plus one round's reply fits the model's
   window, and never below 4,000; split 60% story history / 40% info. The
   reply reserved is the Response Length setting (localStorage
   `customMaxOutput`, 8,000 by default in the UI, which gameplay passes in)
   capped by the model's own maximum; `GM_STAGE_DEFAULT_OUTPUT` (12,000) is
   only the helper's fallback when no Response Length is given.
2. **The story stage** — the narrator. If the GM's final round already wrote
   prose (no tool call that round), that content *is* the story. Otherwise the
   same conversation is continued with `buildStoryContinuationPrompt()`,
   streamed — but on the **narration model** (`getEffectiveNarrationModelKey()`,
   default Mistral Small 3.2), not the GM's tier model.
3. **The choices stage** — a separate call on the narration model
   (`generateChoicesWithRetry` → `parseChoices`), only when
   `storyData.autoGenerateChoices` is on. It is off by default.

`app/api/generate/route.ts` and `app/api/generate-stream/route.ts` are dumb
proxies: they take `{ messages, tools?, model, ... }` and hand them to
`providerCall.ts`, whose two entry points, `generateNonStreaming()` and
`generateStream()`, branch on the provider the model implies (DeepSeek,
OpenRouter, Mistral, DeepInfra, Google AI Studio, Z.ai) and normalise each
provider's response into one shape. They know nothing about `StoryData`, prompts or tools. **The
standalone build has no API routes**: `providerFetch()` calls the provider
in-process when `isStandalone()`. Google gets a filtered tool list
(`GOOGLE_ESSENTIAL_TOOLS`), which is stale (§6.14).

**Claude reaches the app through OpenRouter** (Haiku, Sonnet and Opus 5.5,
`anthropic/…` ids; decision 10) and has its own branch in `providerCall.ts`,
keyed on `isAnthropicViaOpenRouter()`, because Claude 5.5 returns a 400 for
things every other provider is sent: no sampling parameters (not even
`temperature`), no assistant prefill (trailing or mid-history), `tool_choice`
always `auto` (the gates' own user message does the forcing), effort `none`
sent as `low`, and only the current turn's signed `reasoning_details`
replayed. `max_tokens` never goes below 4,096, because Claude's thinking
counts against it, and a Claude call is billed at OpenRouter's own
`usage.cost`. A request built outside `providerCall` (the OCR importer's
`callProviderAI`) needs the same care. The GM stage marks the player's
action `cacheBreakpoint`, and a
Claude request with tools gets prompt-cache breakpoints there and on the
system message. A change to the GM prompt's message layout must keep the
base messages byte-identical across a turn's rounds, or that cache stops
hitting.

**The player's own Claude subscription runs through the `claude` CLI, on the
desktop app only** (decisions 10–13, `docs/claude-gm-design.md` §4). The
models are "Claude Opus / Sonnet / Haiku (subscription)", provider
`claude-cli`, pinned to `claude-*-5-5`. `providerFetch` sends them to
`claudeCli.ts` before anything else, which renders the request into a
system-prompt file and stdin and runs the CLI once per request through the
Rust command in `src-tauri/src/claude_cli.rs` (`claude_cli_status`,
`claude_cli_run`, `claude_cli_cancel`). A round that offers tools runs in
structured mode (a JSON schema for `{narration, tool_calls}`, the CLI's own
tools off) and the app executes the calls itself; a request without tools
streams text. The first round of a fresh conversation that makes no call and
claims its tools are down is retried once with a call required (`runRound`,
`claimsToolsUnavailable`); every CLI run writes a "Claude CLI run" line to the
Debug Logs. Off the desktop a synced subscription choice falls back to the
slot's default (`reasoningTiers.ts`, decision 16), and the side agents reach
the subscription only when a layer is pointed there (`resolveSideCallModel`,
decision 12). A usage limit or a missing sign-in stops the turn with its
message; it never moves to a paid provider. **During an online multiplayer
session (host or guest) subscription models are not used at all** and every
slot runs its default (`claudeCliModels.ts` `setOnlineSessionActive`, set by
`useNetSession`; decision 29); party mode and couch co-op are allowed
(decision 30). **The guardrails are rules,
because Anthropic's terms forbid apps routing requests through subscription
credentials:** never read `~/.claude/.credentials.json`, the keychain or any
token; never bundle, patch or modify the binary; never relay a request from
another device; never call the feature "Claude Code"; the child process
always starts from a cleared environment (no `ANTHROPIC_*` or `CLAUDE_*`
variable reaches it, `claude_cli.rs`'s `build_env` and its test) with the
argument list built in Rust, never taken from the webview.

**Every AI side call goes through `callSideModel()`** (`sideModelCall.ts`):
it uses `providerFetch`, forwards all six provider keys, records the turn
cost, and logs failures to the Debug Logs instead of swallowing them.
`tests/noRawApiFetch.test.ts` fails on a raw `fetch("/api/...")` outside the
`*Fetch.ts` wrappers.

**Model selection is automatic but overridable.** `reasoningTiers.ts` picks
`(model, reasoning_effort)` per turn. Every tier slot
(`reasoningTierOverrides`), the narration model (`narrationModelOverride`)
and each side agent (`layerSettings.ts`) can be overridden in Settings, and
the GM can raise its own tier with `set_reasoning_tier`, capped by
`MAX_TIER3_CALLS_PER_SCENE`. The heavy tiers are Grok 4.5 (combat) and Kimi
K3 (boss fights). An unpinned side agent (the Observer, Memory Keeper,
Director Assistant, Story Progress Observer, compaction and reflection) runs
on the narration model (decision 19). A model handed to a call must be an
`AI_MODELS` key or a custom model's UUID, never `GenerationMeta.model` (the
provider's own id), which `getModelConfig()` silently swaps for DeepSeek V4
Flash.

## The GM is tool-calling, not a fixed dice system

There is **no `rpgSystem` picker and no structured stat-block engine.** The
GM improvises dice mechanics per adventure by reading a `mechanics` note and
a `character_sheet` note (freeform text — "notes, not stat blocks"), then
calls tools. **What the GM sees of the notes is decided by `type` and
`enabled` alone** (`buildGMStagePrompt`): `dm_instructions`,
`character_sheet` and `gm_plan` notes go in full into every round, never
truncated, and every other type — `mechanics` included — is listed by title,
for the GM to open with `read_notes`. Neither `alwaysOn` nor keyword
triggers change that (§6.15), and no note has a size cap, so a system's
core rules belong in a pinned note and the rest in notes read on demand
(decision 72). **A GM tool lives in up to six places** — its schema
(`gmTools.ts`, or `toolSchemas.ts` for state tools), the live whitelist in
`buildGMStagePrompt`, its executor, `GOOGLE_ESSENTIAL_TOOLS`, its label
(`gmToolLabels.ts`) and the observer's registration — and they drift; the
`engine-review` agent checks all six. The full catalogue is the status
report's §11.3. The ones that shape play:

- `formula_roll` / `opposed_formula` — all dice resolution goes through
  these. **They report what the dice showed and never judge it**: no tool
  takes a `dc`, and `calculate` is what turns a roll into a verdict.
  `formula_roll` takes `formulas: string[]`, one entry per *independent*
  pool, so a system that rolls dissimilar dice against each other
  (Starforged: `["1d6+2", "2d10"]`) gets separate totals with nothing summed
  across them, and every die in the call is thrown in one physical toss. It
  supports `stakes` (low/medium/high/deadly), per-outcome `consequences`
  (both branches echoed back, since the engine doesn't know which landed),
  and the `target`/`forces_choice` hardness dimensions.
- `calculate` — math *and comparisons*: `'17+3 >= 15'` comes back TRUE/FALSE.
  The only place a pass/fail verdict is decided, so every check is two steps.
  One comparison per call, and no functions: letters and commas are stripped
  before evaluating, so `min(12,10)` silently becomes 1210 (§6.17).
- `start_challenge` / `record_challenge_result` / `cancel_challenge` —
  multi-roll "best of X successes" challenges (`StoryData.activeChallenge`,
  one at a time). `record_challenge_result` banks an outcome and closes the
  challenge when it is decided; there is no live `resolve_challenge`. A check
  inside one is three calls: `formula_roll` → `calculate` →
  `record_challenge_result`.
- `fate_question` / `roll_table` — the Mythic-style oracle (weighted by a 1–9
  chaos factor) and the 45 **built-in** Mythic element tables. The
  adventure's own tables are `StoryLore` notes with `type: "table"` that name
  a die and list results in prose; the GM rolls them with `formula_roll`
  after reading the note.
- `roll_portent` — Prima Materia's second oracle (`primaMateria.ts`): two
  archetypes and a relation, an engine-chosen Frame, and the story's Tint.
  It answers "what is going on here", not yes/no. Its `pm_*` tables were
  stripped on 2026-10-21 (decision 3).
- `gm_roll` — a roll behind the GM's screen, for checks where the player
  knowing a roll happened is itself the spoiler. Always digital, and filtered
  out of the player-visible tool log and timeline via `hiddenFromPlayer`.
- `ask_question` / `ask_for_roll` — the GM asks the player a question, or
  asks them to roll (dice modes `ai` / `manual` / `physical`, with the 3D
  tray).
- `start_game`, `advance_plan`, `open_side_beat` / `close_side_beat` —
  session zero ends with `start_game`, and play runs against a campaign plan
  (`gm_plan` notes, `campaignPlan.ts`).
- `increment_scene`, `resolve_random_event`, `acknowledge_director_move` —
  the director's side of a turn.
- `start_combat` / `add_combatant` / `remove_combatant` /
  `update_combatant_stat` / `toggle_combatant_condition` / `npc_roll` /
  `advance_turn` / `end_combat` — turn-based combat with per-combatant stat
  blocks, independent of the player's character sheet.
- `add_npc` / `update_npc` / `remove_npc` / `npc_reaction`, `generate_name`,
  `get_game_state`, `set_reasoning_tier`.
- `take_rest` — quick/short/long rest by the per-difficulty `REST_CONFIG`.
  It only restores deprecated structured data, so on a freeform adventure it
  mostly increments counters; whether to remove or rework it is an open
  product call.
- `create_thread` / `update_thread` / `resolve_thread` / `abandon_thread`
  (open plotlines) and `create_goal` / `update_goal` / `complete_goal` /
  `fail_goal` / `delete_goal` (player-facing objectives). **No points or XP
  attach to any of this.**
- `manage_timer` — countdown timers. **`auto_advance` timers never tick
  (§6.1)**: the only ticking code is gated on `end_gm_thinking`, which the GM
  cannot call.
- `read_notes` / `search_notes` / `create_note` / `edit_note` / `delete_note`
  and the `edit_lore_*` / `merge_lore` / `duplicate_lore` family — the GM's
  way of reading and updating lore, secrets, the character sheet and the
  mechanics note.
- `search_memory` — durable recall. The GM does not write memory:
  `add_memory` is no longer offered. The Memory Keeper (`memoryAgent.ts`)
  writes the turn memories, and Reflection (`reflection.ts`) appends its
  synthesised insights.

**Executors that exist but are not offered:** `game_over` (so the GM cannot
end a game), `delegate_task` (so the Web Research toggle and Brave key do
nothing), `reaction_check`, `negotiate_price`, `request_continuation` (the GM
prompt still mentions it), the ability tools, and `end_gm_thinking` (dead).
Re-offering or deleting each is an open product call (§6.10).

**Removed or deprecated systems — do not build new features assuming these
are live** (see `docs/game-mechanics.md` "What Changed"):

- Momentum (reroll/guarantee-success currency) — gone.
- The eight-system RPG picker and its client-side advantage/disadvantage —
  gone from play. `rpgSystems.ts` is still 1,941 lines exporting every system
  definition, but live code uses only `parseChallengeRoundsValue`; tests use
  the rest.
- Structured `Stat[]`/`Resource[]` editors and `InventoryItem[]` — gone;
  describe these in the character sheet note. `Choice.item_used` still reads
  legacy `inventory` on old saves.
- `Condition[]` — gone; injuries are narrative prose or `formula_roll`
  consequences. (`toggle_combatant_condition`, the combat-only toggle, is
  unrelated and live.)
- `Achievement[]`, `Quest[]` and the XP/levelling economy — gone; replaced by
  Goals and Story Threads with no points.
- `Ability[]` — no longer offered to the GM; describe abilities in the
  character sheet note. The Story Editor still shows an Abilities section.
- `Passives` — gone.
- `CustomTable[]` / `StoryData.customTables` — gone; tables are
  `type: "table"` notes, and old data converts on load (`tableNotes.ts`,
  `tablesLibraryMigration.ts`). `rollOnCustomTable` survives for a choice's
  legacy `table` field.

Old saves keep these fields for backward compatibility; the GM doesn't read
them. The Story Editor still exposes Abilities, Variables and Relationships
sections.

## The creator is conversational — a Game Designer, not a Game Master

Authoring an adventure means talking to a **Game Designer** AI, a
deliberately different character from the play-time GM. The GM runs a story
for a player and never breaks fiction; the Designer talks to the *author*
about the adventure as a designed object and writes the material the GM later
improvises from. The prompt is `app/misc/designer_ai.ts`.

- `designer_tools.ts` — 12 tools, all targeting things the GM actually reads:
  `set_adventure_info`, `set_premise`, `write_note` / `delete_note` (one tool
  for every `LoreType`, including the mechanics note, the character sheet and
  random tables), `write_npcs`, `write_goals`, `set_starting_choices`,
  `write_presets`, `set_character_sheet_template`, plus deletes.
- `designer_executor.ts` — the deterministic half. Owns `AdventureDraft`,
  applies tool calls to a *copy* so a malformed call can't corrupt the draft,
  and converts with `draftToAdventure` / `adventureToDraft`. It forces
  `mechanics` and `character_sheet` notes `alwaysOn`, but the GM prompt never
  reads that flag: character sheets load in full by type, and rules notes
  are listed by title (§6.15). Its adventures carry none
  of the legacy arrays; `ensureStoryDataArrays()` backfills them when a story
  starts or loads.
- `useDesignerSession.ts` — the bounded tool loop (`MAX_TOOL_ROUNDS = 5`), the
  chat transcript, the IndexedDB save, and `importFromLibrary()`, which merges
  notes picked from the notes library (`LibraryPickerModal`) into the draft,
  deduped on `libraryNoteId`. The Designer learns about imported material
  through `summarizeDraft()`, not the transcript. It calls the model through
  `callSideModel()`, so it works in the native apps. The Google filter strips
  its tools (§6.14).
- `AdventureInspector.tsx` — hand editing. The AI's tools and the inspector
  write to the same draft, and `summarizeDraft()` re-injects live state each
  turn, so the Designer treats the author's manual edits as authoritative.

The old creator — a 12-step wizard, a staged batch generator,
`creator_tools.ts`, `creator_ai.ts`, `story_creator_ai.ts`, the
`CreatorAIChat` sidebar — is **deleted**. Don't restore it. `jsonRepair.ts`
survives because the OCR pipeline uses it.

## Data model

`app/misc/structs.ts` is the single source of truth for all shapes —
`StoryData`, `Scene`/`ScenePart`, `Choice`, `StoryLore`, `MemoryEntry`
(string or `{content, embedded}` — use `getMemoryContent()`), `NPC`,
`StoryThread`, `Goal`, `CountdownTimer`, `SceneChallenge`, `AGMTState`
(tension, chaos, tint, director state). `LoreType` is `lore`,
`character_sheet`, `mechanics`, `secret`, `table`, `dm_instructions`,
`story_instructions` and `gm_plan`, plus six legacy aliases; notes have a
two-pass `visibility`: `always_reveal` (the default when unset), `hidden`,
`to_be_revealed` and `check_per_turn`. `read_notes` wraps the hidden kinds in
`[[HIDDEN_LORE]]` markers, but the function meant to strip them before the
narrator has no caller, so the narrator receives that text (§6.16). Fields
marked `DEPRECATED` are back-compat only — grep for it before assuming a
field is live.

**`Story` does not take spread props.** It is called
`<Story storyData={storyData} … />` with about fifty props (`StoryProps`,
`story.tsx`). Spread props are used only for `MenuPage`, `LorePage`,
`NPCsPage` and `GoalsPage`.

## The five-layer AI-GM architecture

Framed by `docs/five-layer-architecture-changelog.md` and
`docs/architecture-frontier.md`: **(1) state** (`StoryData`, tool-mediated
only); **(2) oracle/entropy** (`diceFormula.ts`, the Mythic chaos factor,
Prima Materia); **(3) director/pacing** (`AGMTState.tension`,
`selectDirectorMove()` — a deterministic policy choosing from a bounded
PbtA-style move menu, with a rolled complication seed on the two pressure
moves; the Director Assistant's spotlight tracking; the Story Progress
Observer; `pacingFeedback.ts`); **(4) memory** (`MemoryEntry` with
timestamp, scene index, entity ids and importance, written by the Memory
Keeper, periodic `reflection.ts` synthesis, compaction — semantic reranking
is dead, §6.9); **(5) adjudication** (`checkNarrationConsistency()` in
`consistencyCheck.ts`; the Observer in `observer.ts`, whose major findings
can trigger a rewrite or a reset of the GM's turn; and the M2 roll-invariant
gate that forces a re-prompt if a gated scene
ends with no roll). Read `docs/architecture-frontier.md` before proposing new
work in any of these layers — it tracks what was tried and reverted, and why.

## BYOK, no accounts, local storage, native shells

- **There is no auth, no account and no database.** `app/layout.tsx` wraps
  only `NotificationProvider` and `APIKeysProvider`.
- **AI is BYOK, always.** Keys live in the player's storage, read through
  `useAPIKeys()` (`APIKeysContext.tsx`): six LLM keys (OpenRouter, DeepSeek,
  Google, Mistral, DeepInfra, Z.ai) plus Brave Search, Cartesia and
  ElevenLabs. **The Z.ai key is for Z.ai's general pay-as-you-go API only**
  (decision 18): `providerCall.ts` calls `ZAI_CHAT_COMPLETIONS_URL`
  (`/api/paas/v4`) and nothing else, and the desktop allowlist admits only
  `https://api.z.ai/api/paas/*`. Never add the GLM Coding Plan's endpoints
  (`/api/coding/paas/v4`, `/api/anthropic`): Z.ai limits that plan to its
  supported coding tools, and `tests/providerCall.zai.test.ts` fails on
  either. Z.ai's GLM-5.3 always thinks, so its requests carry
  `thinking: {type: "enabled"}` and `reasoning_effort` low, high or max,
  `tool_choice` `auto` (the only value Z.ai accepts), `temperature` clamped
  to [0, 1], the same 4,096 `max_tokens` floor as Claude, and the model's
  `reasoning_content` handed back inside a tool loop.
  OpenRouter can also be connected by PKCE sign-in: a redirect on the web, the
  system browser and a pasted code in the native apps (`openRouterOAuth.ts`,
  `openExternal.ts`, decision 8). `getAvailableModels()` (`ai_prices.ts`) is
  "which models can this player actually call". The one route without a key
  is the player's own Claude subscription through the `claude` CLI on the
  desktop (see "Generation" above): the CLI's sign-in, which the player does
  in a terminal, unlocks it, and the app never sees it.
- **Coins and Stripe are fully removed.** Cost figures in the UI
  (`turnCost.ts`, `TurnCostPanel.tsx`) are real dollar estimates against the
  player's own key. Don't reintroduce a coin or credit concept.
- **Storage is on the device.** The `local*Manager.ts` files keep stories,
  adventures and the libraries in IndexedDB (folders in localStorage), and
  keys and settings live in localStorage. Optional cross-device sync stores
  encrypted blobs in Cloudflare KV through a Worker (`sync-worker/`,
  `syncManager.ts`, `NEXT_PUBLIC_SYNC_API_URL`); the server never sees the
  plaintext.
- **The native shells.** `NEXT_PUBLIC_STANDALONE=true` builds the static
  export; `isStandalone()` (`standalone.ts`) switches code paths;
  `providerFetch` and `getProviderFetch()` (`platformFetch.ts` — Tauri's scoped
  HTTP plugin on the desktop) reach providers without routes. Every host the
  desktop app calls must be in `src-tauri/capabilities/default.json`; the
  opener plugin is scoped to `https://*`. The app's own Rust commands (only
  the `claude_cli_*` ones so far) are named in `src-tauri/build.rs`'s app
  manifest, so each needs an explicit `allow-*` permission in that file; a
  new command must be added in both places.
- **Multiplayer**: couch co-op on one device, and host-authoritative
  peer-to-peer online play (`app/misc/multiplayer/`, Trystero and PeerJS).
  The host broadcasts the whole `StoryData` to guests, GM secrets included,
  and `ask_question` is not relayed to guests (§6.12). In the native apps,
  "Copy invite link" copies a text invite with the room code (decision 7).
- **Environment**: the only env vars are `NEXT_PUBLIC_SITE_URL` (the
  OpenRouter HTTP-Referer), `NEXT_PUBLIC_STANDALONE` and
  `NEXT_PUBLIC_SYNC_API_URL`. Node ≥ 20.9.

## Directory map

- `app/misc/` — nearly all core logic: prompt builders (`ai_staged.ts`,
  `designer_ai.ts`; `ai.ts` holds only text helpers), the turn
  (`generation.ts`), tool schemas and execution (`gmTools.ts`,
  `gmExecutor.ts`, `toolSchemas.ts`, `toolExecutor.ts`), oracles and dice
  (`mythic.ts`, `mythicChaos.ts`, `primaMateria.ts`, `diceFormula.ts`), side
  agents (`observer.ts`, `memoryAgent.ts`, `reflection.ts`, `compaction.ts`,
  `directorAssistant.ts`, `storyProgressObserver.ts`), providers
  (`providerCall.ts`, `providerFetch.ts`, `platformFetch.ts`,
  `sideModelCall.ts`, `reasoningTiers.ts`, `ai_prices.ts`), model-quirk
  workarounds (`toolCallFallback.ts`, `turnTimeline.ts`), storage
  (`localStoryManager.ts`, `localAdventureManager.ts`,
  `localFolderManager.ts`, `localNotesLibraryManager.ts`,
  `localTablesLibraryManager.ts`, `localPDFImportManager.ts`,
  `syncManager.ts`), and `multiplayer/`.
- `app/api/` — the BYOK proxies: `generate`, `generate-stream`,
  `ocr/{process,merge,summarize,summarize-stream}`, `tts/generate`,
  `stt/transcribe`, `creator/generate-image`, `web-search` (only reachable
  from the unoffered `delegate_task`).
- `app/story/` — gameplay UI: `page.tsx` (the orchestration shell, ~5,000
  lines), `story.tsx` (presentational), `menu.tsx` and `menu/` (the in-story
  editors), `lore.tsx`, `npcs.tsx`, `goals.tsx`, `variables.tsx`,
  `ContextViewer.tsx` and `LogViewer.tsx` (the debug views),
  `NPCReactionToast.tsx`, `StoryTabBar.tsx`, `create-character/`.
- `app/creator/` — the Game Designer: `page.tsx`, `DesignerChat.tsx`,
  `AdventureInspector.tsx`, `useDesignerSession.ts`.
- `app/library/` — folder-first browsing (`LibraryHome.tsx`,
  `FolderDetailView.tsx`), stories, adventures and the notes library.
- `app/components/` — shared UI: the dice tray (`DiceThrowModal.tsx`,
  `ManualRollModal.tsx`), TTS/STT controls, the API key modal,
  `PDFImporter.tsx`, the Settings tabs. `CharacterSheetEditor.tsx` and
  `CharacterSheetTemplateEditor.tsx` are imported nowhere; during play the
  sheet is a pinned note on the Lore page (`app/story/lore.tsx`), and the
  nine `CHARACTER_SHEET_PRESET_TEMPLATES` reach no live screen.
- `src-tauri/`, `android/`, `ios/` — the native shells. `sync-worker/` — the
  sync backend. `scripts/` — `patchDiceBox.mjs` (postinstall) and
  `build-standalone.mjs`. `.github/workflows/build-apps.yml` — the manual
  native release build, never run.
- `tests/` — Vitest, about 1,600 tests, largely against `app/misc/`.
  Deterministic tests seed `Math.random`; follow that for new dice and oracle
  tests.
- `docs/` — mixed freshness (see the top of this file). The `*.sql` files are
  one-off Supabase migrations from before the local-first pivot; there is no
  database any more.

## Conventions

- TypeScript strict mode. `any` is not allowed in new code — there are ~134
  existing uses, which are debt, not precedent. Path alias `@/*` → repo root
  (`import { StoryData } from "@/app/misc/structs"`).
- Tailwind v4: use `bg-linear-to-*` for gradients, not the v3
  `bg-gradient-to-*` syntax.
- `"use client"` only when a component needs it. In practice nearly every
  component under `app/` does; server components are the default in name.
- Toasts: `addNotification("message", "success"|"failure"|"warning"|"info")`
  via `NotificationContext`.
- **No `Math.random()` or `Date.now()` during render**, for ids or keys.
- **Don't change `structs.ts` interfaces without updating every usage**, and
  backfill any new required `StoryData` field in `ensureStoryDataArrays()`
  (`storyDataDefaults.ts`), or old saves and Designer adventures will crash.
- **No text copied from a product the project does not own** — rules,
  tables or prose (decision 3). The repository is public.
