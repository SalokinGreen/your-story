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
tick on a story with no campaign record (6.1; campaign clocks do, slice C1 of
2026-10-25), threads never linked to timers (6.2; clocks link to fronts,
factions and threads), random ids and keys
during render (6.3–6.5), the dead Embeddings toggle (6.9), online guests
receiving the GM's secrets (6.12), and the
stale Google tool filter (6.14, partly fixed 2026-10-22: `start_game` and the
challenge and scene tools now reach Gemini, the rest of the list is still
dropped). The unoffered GM tools (6.10) were deleted on 2026-10-23 (decision 128). Four more were found on 2026-10-22 (decision 65): rules notes listed
by title only while the prompt, comments and docs say pinned (6.15), hidden
note text reaching the narrator (6.16, fixed for the separate narration call and rewrites by campaign slice 2, 2026-10-25), `calculate` evaluating `min(12,10)`
as 1210 (6.17), and `search_notes` returning disabled notes (6.18); and
three from the token measurements: a thinking-only turn saving an empty
story (6.19), story falling between the history window and the summary
(6.20, fixed by the token-savings PR T1: history has a fixed start at the
summary's end), and memory trimming upsetting reflection's index (6.21); and one
while planning that build: `story_instructions` notes, documented as the
narrator's style guide, never reaching the narrator (6.22, partly fixed by slice 2: the separate narration call and rewrites get them; prose the GM writes inline does not). There is still
no CI on pull requests.

**The product is the native apps (decision 1).** Tauri desktop and Capacitor
Android/iOS, packaged from the `NEXT_PUBLIC_STANDALONE=true` static export.
There is no public website; the Vercel deploy is a testing vehicle. A change
that only works on the web build is broken.

This file is for how to work here, plus the architecture facts a session
needs so it does not build on a system that was deleted.

## What this app is

Endless Adventure is a Next.js 16 (App Router) + React 19 + TypeScript app: an
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
| an Android build | yes (the SDK since 2026-10-24; the `verify` skill has the command and the shared signing key) | **no** — `build-apps.yml`, with the author's go |
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
   `maxToolLoops` (default 10). The plan gate and, in session zero, the setup gate can force
   `tool_choice: "required"`. The roll gate (M2) sends `rollGateMessage(offeredTools)`
   (`gateMessages.ts`: it names the roll and oracle tools this story is offered, points at
   the action the player declared this turn, and lets the GM decline) with an explicit
   `tool_choice: "auto"`. After those, a system's **turn-end checks** run
   (decision 183, `docs/dawn-gate-design.md`): when a turn ends on prose and
   the turn's words (the GM's visible prose, or any one player line) cross a
   line the system declared and no executed result of the check's tool exists
   this turn, one conditional user message is appended and the next round runs
   with an explicit `tool_choice: "auto"`, so the GM may decline. Off in
   session zero and for a repetitive round; one reminder per check per turn;
   logged and skipped when no round is left. The only check so far is Blood &
   Bone's `night-ended` (dawn, so `end_session` and the Reckoning). This is the "brain": it reads the character
   sheet and mechanics notes and decides on rolls and state changes. Its
   budget comes from `computeGMStageBudget()`: the Memory Size slider
   (localStorage `customMaxContext`, default `GM_STAGE_DEFAULT_BUDGET` =
   36,000), capped so the input plus one round's reply fits the model's
   window, and never below 4,000; split 60% story history / 40% info. The
   history is every story part after `scene.summarizedThroughIndex` (a fixed
   start, `getHistoryParts()`), so between summaries it only grows at its end.
   Each past turn is replayed by `renderHistoryPart()` (`historyStubs.ts`,
   decisions 90, 99, 103): a tool result over 150 tokens becomes a one-line
   stub ("read_notes "X": 2,029 tokens, cleared from history. Read it again if
   you need it."), a long tool-call argument becomes a size marker, the GM's
   old `<thinking>` is dropped, and dice and oracle results stay whole; the
   full `gmConversation` stays on the part for the summary and the debug
   views, and the current turn's rounds are never stubbed. When that history,
   counted as rendered, passes the history budget, `planCompaction()` folds
   the oldest parts into `scene.summary` until about half the budget remains
   (decisions 94, 101); if the summary fails, that turn falls back to a
   sliding window (`slidingFallback`, logged) and it is retried next turn. The
   summariser (`compaction.ts`) is given the folded turns' tool calls and
   results too, writes seven fixed sections (`SUMMARY_SECTIONS`, about
   `SUMMARY_TARGET_TOKENS` = 2,000), and follows the adventure's
   `summary_instructions` note (read only by the summariser, never by the GM
   or the narrator) and a "Compact now" focus; the story menu's Compact Story
   dialog has *Summarise Now* (`summarizeNow()`, keeps the last two turns and
   removes nothing). The choices prompt keeps its own prose window. The
   reply reserved is the Response Length setting (localStorage
   `customMaxOutput`, 8,000 by default in the UI, which gameplay passes in)
   capped by the model's own maximum; `GM_STAGE_DEFAULT_OUTPUT` (12,000) is
   only the helper's fallback when no Response Length is given.
2. **The story stage** — the narrator. If the GM's final round already wrote
   prose (no tool call that round), that content *is* the story. Otherwise a
   separate call writes it from the **narration context**
   (`buildNarrationContext`, `campaign/narrationContext.ts`; campaign slice
   2, design 14.1), not the GM's conversation: a fixed narrator system message;
   a stable user block marked `"prefix"` (premise, the player's character, the
   campaign's tone, lines and veils, every enabled `character_sheet` note, the enabled `story_instructions` notes);
   a live user block marked `"turn"` (a short roster of living NPCs by name,
   role and public description, the last turns' visible prose, the
   player's line, and each tool result's `publicSummary`, an allowlist by tool
   name in `turnTimeline.ts`: dice, oracles, meters, challenges, combat and the
   player's answers, and a visible timer or clock that fired; never a note
   read, a memory search, the campaign tool, a hidden roll, a hidden timer or
   clock, or an error); then `buildStoryContinuationPrompt()`,
   streamed. It never holds the GM's reasoning, tool arguments, read notes,
   secrets, unfound clues, `gm_plan` or `dm_instructions` notes, NPC notes or the running summary. The Observer's rewrite and the
   pre-pause rewrite continue the same context (`GenerationResult.narrationContext`;
   the narrator's own reasoning, `narrationOwnThoughts`, is the only reasoning
   a rewrite sees, and only on this path). Claude's cache marks apply to
   tool-carrying requests only, so this tool-less call keeps just the
   `session_id` (`:narration`) and the stable block's byte-identity. The narrator
   no longer sees lore, memory or the summary (a quality risk plan G4 revisits). It runs on the **narration model** (`getEffectiveNarrationModelKey()`,
   default GLM 5.3 through OpenRouter, decision 50), not the GM's tier model.
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
(`GOOGLE_ESSENTIAL_TOOLS`), which is still stale (§6.14: it has `start_game`,
`confirm_setup`, `ask_question` and the challenge tools now, not the plan,
timer, thread or goal tools).

**Claude reaches the app through OpenRouter** (Haiku, Sonnet and Opus 5.5,
`anthropic/…` ids; decision 10) and has its own branch in `providerCall.ts`,
keyed on `isAnthropicViaOpenRouter()`, because Claude 5.5 returns a 400 for
things every other provider is sent: no sampling parameters (not even
`temperature`), no assistant prefill (trailing or mid-history), `tool_choice`
always `auto` (the gates' own user message does the forcing), effort `none`
or no effort at all (an unpinned side agent) sent as `low`, and only the current turn's signed `reasoning_details`
replayed. `max_tokens` never goes below 4,096, because Claude's thinking
counts against it, and a Claude call is billed at OpenRouter's own
`usage.cost`. Qwen 3.8 (`qwen/qwen3.8…`) gets `tool_choice` `auto` too
(`modelRejectsForcedToolChoice`): it thinks by default and is reported to
reject a forced tool call, though OpenRouter lists the parameter as
supported. A request built outside `providerCall` (the OCR importer's
`callProviderAI`) needs the same care. **The GM request is ordered by how
often each piece changes** (decision 91, `buildGMStagePrompt`): the system
prompt with nothing per-turn in it; one user message, the stable block
(`buildStableBlock`: the player, the archetype, the DM instructions, the
"story so far" summary), and a short assistant acknowledgement; history (every
part after `summarizedThroughIndex`), its last message marked
`cacheBreakpoint: "prefix"`; then ONE user message, the live block and the
player's action (`buildLiveBlock`: the character sheet, the campaign plan,
the note-title lists (`renderNoteTitleList`: a built-in pack's notes on one line per category with the shared prefix said once, its creation prompts under their own heading, the story's own notes one line each), memory, NPCs, goals, threads, the oracle line, combat,
timers, pending events and moves, then the setup blocks, the Observer,
progress, repetition and knowledge notes, the pacing note and the GM tip),
marked `"turn"`. `generation.ts` marks the last message of each later round's
request copy `"round"` (`cacheMarks.ts`). A Claude request with tools gets
`cache_control` on the system message and the last message of each mark kind,
four at most; the system message and the "prefix" mark live an hour (`ttl: "1h"`,
decision 186), "turn" and "round" five minutes; the `claude` CLI puts everything up to the `"prefix"` message in
its system file. **Anything per-turn goes in the live block, never the system
prompt or the stable block**, and a change to the layout must keep the base
messages byte-identical across a turn's rounds and everything up to the end
of history identical across turns, or the caches stop hitting
(`tests/tokenBudget.test.ts` measures the shared prefix). Mistral gets a
`prompt_cache_key` and OpenRouter a `session_id` (`ys:<storyId>:gm` and
`:narration`; a Mistral 400/422 naming the key retries once without it and
turns it off for the session). OpenRouter and Google models get an earlier
turn's `reasoning` and `reasoning_details` no longer, only the current
turn's; DeepSeek still gets `reasoning_content` on every tool call.
**The GM's tool list is one stable, trimmed list** (decision 92): every
live tool in every round of every turn, in one order, so it caches with the
prefix, and under 10,000 tokens for a default story (it was 15,841;
`tests/toolBudget.test.ts` holds it). A tool description says what the tool
does and how to call it; behavioural guidance lives in the system prompt, not
per tool, and a new or longer description counts against the budget. A tool
offered only when a story flag is set (`ask_for_roll` in Manual Dice Mode; the
image tool and the default-systems tools when they land) is added to or
left out of the list from a **story-level setting** that is read the same on
every turn, never from per-turn state. **The notes the GM prompt carries in
full every turn** (the DM instructions, the character sheets and the campaign
plan) are warned about past about 3,000 tokens each, in the Adventure
Inspector, the lore editor and the Designer's `write_note` result, and capped
at 10,000 tokens together (decision 96, `contextLimits.ts`): past that the
prompt carries the front of each (the plan also keeps its last
`## Current beat` section whole, decision 110), ends the front with
`[… N more tokens: read_notes "Title" for the rest]`, and the stored note is
untouched. The DM instructions are capped on their own (4,000 tokens) so
the stable block never moves when the sheet or plan changes length, and
`edit_note` refuses a whole-note rewrite of a shortened pinned note until the
GM has read it (or if the new text carries the pointer line).

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
streams text. A round that makes no call and claims its tools are down
(including "No such tool available") is retried once with a call required
(`runRound`, `claimsToolsUnavailable`; any round since decision 178, not only
the first of a fresh conversation); every CLI run writes a "Claude CLI run" line to the
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
`(model, reasoning_effort)` per turn from a four-tier ladder; the GM can raise
its own tier with `set_reasoning_tier`, capped by `MAX_TIER3_CALLS_PER_SCENE`
(which counts requests for the top tier, not every top-tier call: session
zero, a single-enemy fight and deadly stakes put a turn there directly).
**Settings shows two slots over those four tiers** (decisions 118–124,
`docs/model-picker-design.md`): **Default** fills tiers 0–2 and **Advanced**
tier 3, each a model and an effort, written by `setSlotOverride` into the same
synced four-entry `reasoningTierOverrides` array (it keeps every other entry
byte for byte, so a newer build's model survives), and read from tier 1 and
tier 3 (`getSlotOverride`, `getEffectiveSlot`); an array an older build wrote
with differing tiers 0–2 shows as "Mixed" (`getDefaultSlotMix`). The default
ladder (`REASONING_TIERS`, decision 122) is GLM 5.3 for tiers 0 and 1 (effort
`none`, which GLM gets as `low`), GLM 5.3 for tier 2 (combat and rules,
`high`) and Claude Sonnet 5.5 for tier 3 (session zero, boss fights,
campaign-shaping calls, `xhigh`); tier 2 never runs below `high` whatever the
Default effort (`atLeastEffort` in `getEffectiveTiers`, decision 123). All are
OpenRouter models, so one OpenRouter key runs the lot (a Z.ai-only player
picks "GLM 5.3 (Z.ai)" in both slots). **Narration follows Default**:
`getEffectiveNarrationModelKey`/`Effort` return the Default slot, and the old
`narrationModelOverride`/`narrationEffortOverride` keys are still stored and
synced for older builds but no longer read on the play path. The ambiguity
classifier runs on the side-agent model (Haiku, `none`), or on Default for a
player with no key for it. The Observer's `tier_escalation_missed` retry asks
for the nearest tier that is a different call (`nextDistinctTier`), and keeps
the turn instead of rerolling it when none is (`observerRetryTier`); the step
down after a GM error looks for a different model. The side agents' pickers
live under Settings → AI → Advanced settings (`SideAgentPickers`). An unpinned
side agent (the Observer and its judges, Memory Keeper, Director Assistant,
Story Progress Observer, compaction and reflection) runs on
`SIDE_AGENT_DEFAULT_MODEL_KEY` in `layerSettings.ts`, Claude Haiku 5.5,
whatever the narration voice is (decision 51, which revised decision 19),
except that a player with no key for that default's provider (no OpenRouter
key) gets the narration voice instead when it is not a subscription model and
they have its key (`resolveSideCallModel(override, keys)`, which every side
call in `generation.ts` passes the six provider keys); it takes no fallback
model, so a side agent can never inherit the GM model, or a subscription one. The
Observer's rewrite is the exception, because it writes the prose the player
reads: an unpinned Observer rewrites on the narration voice, which is now the
Default slot (`resolveObserverRewriteModel`, decision 52), while its judges
stay on Haiku.
The choices call, including the one re-run after an Observer rewrite, stays
on the narration model. **Every call carries an explicit effort** (decision
53), chosen alongside its model and `none` by default, the cheapest effort
each model allows (Claude, GLM 5.3 and the OpenRouter models flagged
`reasoningMandatory`, which reject an explicit `none`, are sent `low`;
`reasoningCannotBeTurnedOff` in `providerCall.ts`): each model slot
(Default, Advanced) and each side-agent pin has an effort picker, and so does
the Game Designer (`designerReasoningEffort`); the narration effort is the
Default slot's (`getEffectiveNarrationEffort()`, which falls back to `none`
when the slot's model can't run here). An unpinned side agent and the tier
classifier run at `SIDE_AGENT_DEFAULT_EFFORT` (the classifier at Default's
effort when it falls back to Default), and the Observer's unpinned rewrite and
the choices at the narration effort; `callSideModel` sends `none` for a request that names
none, so `applyReasoningEffort`'s Claude-without-effort rule is only a
backstop, and `tests/everyCallCarriesEffort.test.ts` fails when a new inline
call omits `reasoningEffort`. A model handed to a call must be an
`AI_MODELS` key or a custom model's UUID, never `GenerationMeta.model` (the
provider's own id), which `getModelConfig()` silently swaps for DeepSeek V4
Flash. A saved choice (a tier, the narration voice, a side agent, a lore image
model) naming a key the catalog has dropped reads as unset and uses the slot's
default (`isKnownModelKey()`, `resolveImageModelKey()` in `ai_prices.ts`), so
removing a catalog entry is safe for saved and synced settings; a retired key
can instead be aliased to its successor (`LEGACY_MODEL_KEY_ALIASES`, read by
every saved-choice reader through `resolveModelKeyAlias()`), so a saved choice
keeps working, which the retired Mistral models rely on for a player whose only
key is Mistral's, and the retired DeepInfra models for a player whose only key is
DeepInfra's (refreshed 2026-10-25, the dated note at the end of
`docs/research/gm-models-2026-10-21.md`). The catalog was
checked against OpenRouter and each vendor on 2026-10-21 (see the dated note in
`docs/research/gm-models-2026-10-21.md` §6); `DeepSeek V4 Flash` is kept as a
key only for the fallback and saved settings, and calls `deepseek-flash`.

## The GM is tool-calling, not a fixed dice system

There is **no `rpgSystem` picker and no structured stat-block engine.** The
GM improvises dice mechanics per adventure by reading a `mechanics` note and
a `character_sheet` note (freeform text — "notes, not stat blocks"), then
calls tools. **What the GM sees of the notes is decided by `type` and
`enabled` alone** (`buildGMStagePrompt`): `dm_instructions`,
`character_sheet` and `gm_plan` notes go in full into every round, never
truncated, and every other type — `mechanics` included — is listed by title (a
built-in pack's titles folded into one line per category), for the GM to
open with `read_notes`. Neither `alwaysOn` nor keyword
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
  and the `target`/`forces_choice` hardness dimensions. `parseFormula`
  (`diceFormula.ts`) reads a bare `dN` as `1dN`; refuses any `d66` (two d6,
  tens then ones: `["1d6","1d6"]`); refuses `*`, `/`, `×`, `÷`, `^` and `%`
  with a pointer to `calculate`; ignores words and brackets as labels, so
  `1d6+2 (Nerve)` rolls as `1d6+2`.
- `calculate` — math *and comparisons*: `'17+3 >= 15'` comes back TRUE/FALSE.
  The only place a pass/fail verdict is decided, so every check is two steps.
  One comparison per call, and no functions: letters and commas are stripped
  before evaluating, so `min(12,10)` silently becomes 1210 (§6.17).
- `start_challenge` / `record_challenge_result` / `cancel_challenge` —
  multi-roll challenges (`StoryData.activeChallenge`, one at a time), in two
  modes. `first_to` (the default) is "first to N successes, or M failures";
  `tally` takes exactly `rounds` results (strong hit +1, weak hit 0, miss −1)
  and ends `won` at +1 or more, `even` at 0, `lost` at −1 or less.
  `record_challenge_result` banks an outcome and closes the challenge when it
  is decided; there is no live `resolve_challenge`. A check inside one is
  three calls: `formula_roll` → `calculate` → `record_challenge_result` (or
  `action_roll` → `record_challenge_result`). The active challenge, the
  meters and the tracks are shown to the GM every turn in the live block
  (`formatActiveChallengeState`, `formatMetersAndTracksState`); the second
  `start_challenge` implementation in `toolExecutor.ts` is gone.
- **System tools — offered only to stories that use a system** (decision 79:
  `resolveSystem()` in `app/misc/systems/resolve.ts`, true when the story's
  lore holds a built-in system's notes, or `systemState.usesSystemTools` says
  so, set by hand in the Designer inspector; the first system is Blood & Bone, below): `manage_meter` (named numbers
  owned by a character or `world`, clamped to floor and cap, thresholds
  reported, `once_per` scene/session dedup, `create_set` from the system's
  meter sets), `manage_track` (Ironsworn-style ten-box progress tracks, with
  an engine-decided `progress_roll`), `end_session` (session count, session
  resets, the system's reminder) and `action_roll` (d6 + stat against two
  d10s, adds capped at +2, score at 10, ties to the dice; `success` is false
  on a miss). Shapes in `structs.ts`, arithmetic in `metersAndTracks.ts`.
- **Blood & Bone is the first default system** (`app/misc/systems/blood-and-bone/`,
  decisions 62–89, 150–159; design `docs/default-systems-design.md`,
  expansion `docs/bb-expansion-design.md`). Two built-in packs (*Rules*, id
  ending `:rules`: a ≤3,000-token `dm_instructions` core the GM carries every
  round, the rest read on demand, including the miss tables, oracles and
  table families as `table` notes; *Europe by Night*, id ending `:europe`: an
  overview, seventeen cities, three wild places and three continent notes), the starter *The Hollow Hour*, the
  sheet template and four meter sets (character, Witch, Wendigo, City). The
  text is original, condensed from the author's `docs/blood-and-bone/rulebook.md`
  and credited to the Ironsworn engine under CC BY 4.0. A note keeps its
  `builtin:blood-and-bone:…` id as `libraryNoteId`, which is how
  `resolveSystem` knows a story runs it; `merge_lore` now keeps that id (and
  the sources' shared type and most restrictive visibility), but `delete_note`
  can still remove built-in notes, which turns the tools off in Automatic mode.
  E1 adds twelve table families in `app/misc/systems/blood-and-bone/oracles/`
  (People, The night, Places, The Concord and the factions, The Vigil and
  hunters, The Masquerade, Rumours, Feeding and hunger, Hooks, Objects and
  relics, Investigation, The Hollow Roads), one note each with 3–6 sub-tables,
  and grows the three older oracles from d10 to d20. E3 adds a third
  Archetype for each of the seven original Kinds, in its own note `B&B — <Kind>: The <Archetype>`
  (`archetypes/`: the Courtier, Pilgrim, Shepherd, Hound, Apostate, Penitent,
  Seeker) with two Archetype Powers and two more Kind Powers, and five
  `B&B — More <Assets>` notes (`assets-more/`, six assets each); the creation
  note, the `archetype` step hint and the sheet say the seven original Kinds have three. E4 adds four Kinds
  (decision 160: Revenant, Changeling, Doppelgänger, Rusalka; `kinds-more/`,
  a Kind note and a creation-prompts table each, no new meter sets); the Kind
  list lives once in `kindList.ts` (`BLOOD_AND_BONE_KINDS`), read by the sheet
  template, the creation note, the core's index and `tests/helpers/tableShape.ts`,
  so a per-Kind table must list every Kind. Decision 161: every ability of
  every Power gives a mechanical edge (an add, a better outcome, a penalty
  ignored), never a permission alone; the seven original Kinds' Powers were
  rewritten to it, and decision 162 extends the rule to every asset (Paths, Havens,
  Companions, Relics, Rites). A sub-table names its die
  in its heading: `(1d6)`, `(1d20)`, `(1d100)`, `(1d6, on the Kind's list)` or
  `(d66: roll ["1d6","1d6"], first die is the tens)`. `tests/helpers/tableShape.ts`
  (`checkTableShape`) checks every table note in the packs against those forms
  and rolls each stated die.
  On load, `addMissingBuiltinNotes` (`app/misc/systems/builtinNotes.ts`, called
  from `setupUIFromStory`) adds the Rules notes and the cross-Europe notes a
  story has not been offered (`systemState.builtinNotesOffered`), for a story
  that holds the core note and has not switched the system tools off. It never
  adds a pinned type (`dm_instructions`, `character_sheet`, `gm_plan`), never
  touches a note the story holds, and never re-adds a note the player deleted.
  A story started from an adventure or starter is seeded with every id it
  would be given (`seedBuiltinNotesOffered`). The additions are not saved on
  load; they persist with the story's next save. A pack note's `scope` is a
  city's or region's name, or `cross-europe` (the overview and E2's *The Hollow
  Roads*, *Powers of the continent* and *Who's who*); cities and regions are
  not pushed. E2 (`app/misc/systems/blood-and-bone/europe/`, one file per note,
  gathered into `EUROPE_PACK_NOTES` in `blood-and-bone/index.ts`) adds eleven
  cities in the depth of the approved Budapest sample (Budapest, Edinburgh,
  Dublin, Amsterdam, Stockholm, Lisbon, Marseille, Venice, Naples, Kraków,
  Bucharest), the three wild places (the Carpathians, the Highlands and
  islands, the Alps and the Black Forest) and the three continent notes, and
  deepens the original six in `europe.ts` in place (ids unchanged). `buildHollowHour` copies the Rules pack, the cross-Europe
  notes and London (`HOLLOW_HOUR_CITY`) only.
  **E5 adds two campaign starters in their own American worlds** (decisions
  163–173, `docs/bb-starters-design.md`; `starters/grave-watcher/`,
  `starters/last-resort/`): *Grave Watcher*, a slice-of-life season on a
  graveyard watchtower and in the valley town below it, with the Masquerade
  off (Taint per Watcher, made by the GM with `manage_meter create`; Unrest
  for the world), eight pre-made Watchers as presets, 25 town regulars, 35
  visitors and a d100 of people; and *The Last Resort*, comedy-horror, a
  family inheriting a haunted hotel (Vacancy for Heat), five relatives as
  presets. Each copies the Rules notes but the twelve E1 table families
  (`ownWorldRulesNotes`, `starters/shared.ts`), brings its own tables, and
  rereads the core in its "— Running it" note. All three starters open on an
  arrival (decisions 198–199): The Hollow Hour at the café where Margot's
  envelope waits, Grave Watcher on Founders' Day morning in town (the tower at
  dusk, the green light at the end of the first night), The Last Resort with
  the family pulling up at the Belhaven and the lawyer on the steps. A story's
  `systemState.setting` ("grave-watch", "last-resort"; unset means Europe by
  Night) comes from the starter's template and is kept by the Designer's
  draft; only a Europe by Night story is given the cross-Europe notes on
  load. `tests/systems.starters.test.ts` holds both starters.
  **Every starter ships a built campaign record** (slice 5 of the campaign
  format, decision 224; `tests/campaign.starters.test.ts`): *The Hollow Hour*
  is a `mystery` (`hollowHourCampaign.ts`: a hunter front and a "Margot loses
  patience" front, two secrets with three clues each, Runa, Callum and Margot
  as people, four endings), *Grave Watcher* a `slice_of_life`
  (`grave-watcher/campaign.ts`: a season clock the GM ticks about every four weeks, the Tally and
  Tower Six as slow manual fronts, Ashcombe Holdings with a faction clock,
  twelve regulars with wants, three secrets with four clues, six locations,
  the three Ferry Day endings) and *The Last Resort* a `sandbox`
  (`last-resort/campaign.ts`: four factions, the Boarder and the bank as
  fronts (the bank clock ticked weekly by hand), four secrets, six locations, the four endings). Blood & Bone has no
  `take_rest`, so none of its clocks use `rest`.
  **The core's "Reading abilities" line** (decisions 174–177, after Codex
  reviewed the whole book on 2026-10-24) is how every ability is read:
  non-players never roll (an ability that makes one Face Danger stops a
  Troublesome or Dangerous one, and a Formidable one passes at a cost), "+1
  Advantage" counts one recorded Rule of 3 result a step better, an outright
  defeat works only on Troublesome and Dangerous foes (Formidable and up: the
  track marked three times, Epic once), and rerolling the action die is
  formula_roll ["1d6"] against the same challenge dice. The core is pinned, so
  its budget is its own 3,000 tokens, not the 2,500 read cap.
  `tests/systems.bloodAndBone.test.ts` holds the token budgets and runs the
  core's recipes against the engine.
  **A system can declare engine checks** (decision 183): `BuiltinSystem.turnEndChecks`
  (`SystemTurnEndCheck`, `systems/types.ts`) names trigger phrases (`phrases` for
  the GM's prose and player lines, `playerOnly` for a player's line, span-local
  `exceptions`), the tool result that settles it (`satisfiedBy`) and the
  message sent to the GM. `turnEndChecks.ts` (`textCrosses`, `pendingCheck`,
  `splitPlayerLines`) is the one evaluator and `generation.ts` the one gate;
  a second system adds data, not engine code. Blood & Bone declares
  `night-ended` (`blood-and-bone/turnEndChecks.ts`). `GenerateRequestBody.toolChoice`
  now also takes `"auto"`, which every provider honours (Google's unset
  default is still `required`).
- **Fantastic Realms is the second default system** (decisions 201–219,
  `docs/fantastic-realms-design.md`, plan `docs/fantastic-realms-plan.md`;
  `app/misc/systems/fantastic-realms/`). Words are power: a hero is a concept
  and feats, the pool is 1d6 + one per feat that applies, each die that
  equals or beats the DC (2–6) is a success, and 0/1/2/3+ successes are miss,
  weak hit, hit, strong hit (+1 magnitude per success past 3). Burning a feat
  is one sure success plus its die, then the feat is out until a rest. Three
  hearts; only players roll (a foe is a stat line: DC with its words counted,
  words, hearts, XP); a foe's turn is a threat the targeted heroes answer;
  damage weak 1 / hit 1 / strong 2 +1 per magnitude; XP to every hero present,
  each source once, level N→N+1 costs (N+1)×1,000, a feat per level and +1 max
  heart every third. **Systems now declare their tools** (`BuiltinSystem.tools`;
  `resolveSystem(...).tools` is the GM's system list, Blood & Bone's four
  unchanged and the legacy tools-on switch still giving them) **and a story
  records its system** (`systemState.systemId`, `recordSystemId` at story start
  and on load once the core is held), so imported or deleted notes never switch
  a campaign. Its tools: `manage_meter` (the "Fantastic Realms hero" set: Hearts,
  Level, XP), `manage_feats` (stable feat ids, so a burn survives a rename),
  `feat_roll` (the dice paths of `action_roll`, burns recorded only on a
  completed roll, a refusal is an engine error), `initiative_roll`, `award_xp`
  (the only writer of Level and XP; `setMeterMax` grows Hearts and moves the XP
  max) and `take_rest` (heals, un-burns, returns the realm's rest rule from
  `BuiltinSystem.rests`). The hero state is `systemState.fantasticRealms`,
  shown in the live block (`formatHeroFeatsState`) and as feat chips on the
  Meters panel; the outcome judge reads `feat_roll` (a `"hit"` tier). The note
  loader follows each system's `coreNoteId`, `defaultSetting` and
  `crossSettingScope`, and shared setup steps take `stepHints`. The world is the
  Crossroads (Aurelane, Larkenfell, Gloamreach, each with its own rest); the
  starter is *Wolfwillow Crossing*, an arrival in a Larkenfell village on
  Lantern Eve, which copies every realm (a starter's story is seeded as already
  offered every note, so the loader would never add one). **The engine grown
  (slice E1 of `docs/fr-expansion-plan.md`, decisions 243–256):** every new field is optional, so an old save
  rolls exactly as before (`tests/systems.fantasticRealms.grown.test.ts`).
  A feat may be a `spell` or an `item` (`qualities`, at most two; `status`
  `broken` or `lost`, which keep the item's id and burn); a hero has
  `conditions` (`{word, cure?, scar?}`, each word stored once, a scar never
  cleared by `clear_condition` or a rest) and counted `uses` (`"<featId>:scene|rest|adventure"`);
  the party has `partyFeats` (hearth improvements), `teamBurnsUsed` and
  `partyUses`. **Down is derived** (`isDown`: hearts 0, or three conditions
  that are not scars), never stored. `featUsable` is the one check a feat
  passes in `feat_roll`, `initiative_roll`, helping and team burns. `manage_feats`
  grew `burn`, `break`/`lose`/`recover`/`mend`, `add_condition`/`clear_condition`/`add_scar`/`scar_to_feat`,
  `retire`/`rejoin` (a hero who died or left is out of party rests and defaults), `use` (a feat, a hearth improvement or a named move, with `per` and a `limit` fixed by the first use)
  and `add_party_feat`/`remove_party_feat`. `feat_roll` takes `hindered_by`
  (a die each, pool floor 1), `help` (one helper, +1 die) and `team_burn` (two
  sure successes, no dice from the two burned feats, twice per party rest);
  its refusals come first and write nothing, and it reports `damage` (Keen
  adds a heart on a strong hit; `contracts.ts` reads that number), `magic`
  (a miscast line on a miss) and the one cost budget on a miss or weak hit.
  `take_rest` clears conditions that name no cure (never a scar; Hungry
  stays until a meal), resets `:rest` counters, and renews team burns only
  for a party rest (every hero in the state). `increment_scene` resets
  `:scene` counters (a hook in `toolExecutor`), `end_session` the
  `:adventure` ones. `record_challenge_result` takes `hit` only in a story
  that runs Fantastic Realms (`tallyScore`). The "Fantastic Realms party" set
  holds Supplies (world, 0–6, start 3). The tool list for a Fantastic Realms
  story is 11,449 tokens against the 11,500 limit: a new parameter needs text
  moved out of the schemas first.
  **The rules notes (slice E2, `rules/`):** nine on-demand `mechanics` notes in
  the Rules pack: FR — Magic (forty example spell feats, miscasts, healing),
  Gear (the twelve qualities and what each does), Conditions (sixteen, with cures,
  and scars), Callings (twelve, each a signature, a kit of five, eight path feats
  and a move), Bestiary (the twenty foe words, tactics, phases), Legends (a stub
  that E4 fills), Travel (a journey is a `tally` challenge; Supplies), Downtime
  (and the hearth as party feats) and Group play. Each is under the 2,500-token
  read cap. The core was rewritten with an operational section (one harm budget
  per roll, down, helping, team burns, healing, conditions, miscasts, items,
  counted uses, the index) and is about 2,260 tokens, under its 3,000. The tools teach
  their usage there, so no schema grew. **Built-in notes now update**
  (`updateBuiltinNotes`, `builtinNotes.ts`, called by the story page before
  `addMissingBuiltinNotes`): `BUILTIN_NOTE_HISTORY` (`builtinNoteHistory.ts`)
  lists the hash of every shipped text of every built-in note, current last; a held
  note whose text hashes to an earlier entry is replaced by the current text (the
  pinned core included), one that matches none is the player's edit and is kept
  with a Debug Logs line, and a note with one recorded version (Blood & Bone's)
  never changes. **Changing a built-in note's text means appending its new hash**
  (`tests/systems.noteUpdate.test.ts` fails when the last entry is not current).
  **Its campaign** is an
  `adventure_path` (`wolfwillow-crossing/campaign.ts`): seven beats over Lantern
  Week, the barrow king's front (a hidden clock on `rest`) and the goblins'
  flight (a visible clock on `scene`), two secrets with three clues each, and
  the seven village people as the starter's NPCs (`people.ts`).
  **A shipped record is `origin: "starter"`** (`starterKit.ts` builds them,
  with fixed ids): session zero then replaces the `campaign` step with
  `campaign_review` (`setupSteps.ts`; the GM summarises the public parts and
  applies the player's changes, never rebuilding), words the `style` and
  `tone_safety` hints as confirmations, and `campaignSetupGuide` says the
  campaign shipped built. A style edit keeps the mark (only `"migrated"` is
  dropped by one). The starters' "Running it" notes no longer tell the GM to
  write a plan.
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
- `generate_image` — paints a picture (a scene, an NPC or player portrait, a
  place) in the background. Offered only when pictures are on and a
  fal.ai/DeepInfra/OpenRouter key exists (`imageToolAvailable`); the engine caps
  it per scene and refuses with a reason (see "Pictures in play" below).
- `ask_question` / `ask_for_roll` — the GM asks the player a question, or
  asks them to roll (dice modes `ai` / `manual` / `physical`, with the 3D
  tray). `multi_select: true` questions take several picks (`selectedLabels`,
  decision 146; see "Session zero" below). In session zero an item can carry
  `setup_step` (the creation step it covers, recorded by the engine) and
  `intro` (a sentence or two shown above the options; decision 148).
- `start_game`, `advance_plan`, `open_side_beat` / `close_side_beat` —
  session zero ends with the player's OK on the setup card, which starts the
  game (`confirm_setup`, below); `start_game` is the direct path. Play runs
  against a campaign plan (`gm_plan` notes, `campaignPlan.ts`). `start_game`
  refuses until the character sheet(s), the plan and the player's approval all
  exist (see "Session zero"). Every new adventure starts in session zero
  (`sessionZeroActive`), with or without pre-made characters. The preset
  picker shows only when the adventure has pre-made characters
  (`hasPremadeCharacters()`, `presets.ts`); otherwise the story starts as
  Custom with no screen between. There is no character form; the GM builds
  the sheet in conversation (decision 129). A starting choice's
  `intro_override` waits for `start_game` (`shouldUseIntroOverride()`,
  `presets.ts`); picked during session zero, it replaces `StoryData.intro`
  (decisions 130, 197). The adventure's own opening (the preset's `intro`,
  else the story's) is not shown first either (decision 197): the first part
  is a welcome (`buildAdventureWelcome`: the title, the premise, who the
  player will be, the setup pointer), the opening is kept in
  `StoryData.intro`, and `start_game` hands it to the GM
  (`authoredOpeningForStart`, only for a story whose first part is the
  welcome, so an older save that showed an opening first never gets a second).
- `confirm_setup` — session zero only. Refuses while a required creation step
  is uncovered, then shows the player a card with the sheet(s) and the plan and
  waits for their OK or their changes (decisions 143, 148; "Session zero"
  below). Its OK also starts the game. Always offered, like `start_game`, so
  the tool list does not change at `start_game`.
- `increment_scene`, `resolve_random_event`, `acknowledge_director_move` —
  the director's side of a turn.
- `start_combat` / `add_combatant` / `remove_combatant` /
  `update_combatant_stat` / `toggle_combatant_condition` / `npc_roll` /
  `advance_turn` / `end_combat` — turn-based combat with per-combatant stat
  blocks, independent of the player's character sheet.
- `add_npc` / `update_npc` / `remove_npc` / `npc_reaction`, `generate_name`,
  `get_game_state`, `set_reasoning_tier`.
- `create_thread` / `update_thread` / `resolve_thread` / `abandon_thread`
  (open plotlines) and `create_goal` / `update_goal` / `complete_goal` /
  `fail_goal` / `delete_goal` (player-facing objectives). **No points or XP
  attach to any of this.**
- `campaign` — the campaign record (`StoryData.campaign?: CampaignRecord`,
  `app/misc/campaign/`, `docs/campaign-format-design.md`, plan slice 1):
  factions, fronts, clocks, people, secrets and clues, locations, beats, end
  states. One always-offered tool with a bare schema (135 tokens of the list;
  the data shapes come from `read` on an empty part and from the repair a
  refused write names, `PART_SHAPES` in `validate.ts`). **The engine ticks
  clocks** (`applyTurnEvents` in `clocks.ts`, called by `executeGMTools` after
  each tool, events from typed results in `events.ts`, a `TurnLedger` carried
  across the turn's rounds in `generation.ts`): once per trigger per clock per
  turn. `migrateTimers` turns countdown timers into manual clocks on load, and
  `manage_timer` is translated onto clocks once a record exists. The GM sees
  `formatCampaignBrief` (about 800 tokens, in priority order) in the live
  block. A story with no record is byte-identical to before
  (`tests/campaign.oldSaves.test.ts`). The Designer writes the record too
  (slice 4, below), and the GM builds it in session zero (slice 3, "Session
  zero" below). The starters ship records (slice 5, above). **The player's
  view (slice 6)** is built only from `publicCampaignView`: the Lore page's
  Campaign panel (`app/story/CampaignPanel.tsx`, markup in `CampaignBody.tsx`,
  which takes the projection and cannot be handed the record) shows the pitch
  and tone, lines and veils, visible clocks and "What we know"; `PlayerView.campaign`
  (`buildPlayerView`) gives a seated party phone the same projection, shown in
  a collapsed "Campaign" section; and the online host's snapshot carries
  `guestCampaignRecord(record)` (`campaign/guestView.ts`, rebuilt from the
  projection, so the guest's `campaign` field holds no secret, doom, portent,
  person, hidden clock, beat or end state). That closes the record field only:
  every scene part's `gmConversation` (the GM's `campaign` calls and reads),
  its reasoning and `scene.summary` still go to guests whole and can hold the
  same secrets, as do secret and `gm_plan` notes and the rest of `StoryData`
  (§6.12). A guest's setup strip reads the rebuilt record, so in session zero
  its Campaign and Start ticks can lag the host's; it is read-only.
- `manage_timer` — countdown timers. **On a story with no campaign record,
  `auto_advance` timers never tick (§6.1)**: nothing ticks them. The branch that would have was dead (it sat
  behind `end_gm_thinking`) and was deleted on 2026-10-23 (decision 128).
- `read_notes` / `search_notes` / `create_note` / `edit_note` / `delete_note`
  and the `edit_lore_*` / `merge_lore` / `duplicate_lore` family — the GM's
  way of reading and updating lore, secrets, the character sheet and the
  mechanics note. `read_notes` (`gmExecutor.ts`) matches a title loosely: an
  en dash, em dash or hyphen between spaces is one separator; a built-in
  note may be asked for by its name after " — " (`"Havens"` for
  `"B&B — Havens"`) when exactly one has that name; a miss reports up to
  three closest titles.
- `search_memory` — durable recall. The GM does not write memory:
  `add_memory` was deleted (decision 128). The Memory Keeper (`memoryAgent.ts`)
  writes the turn memories, and Reflection (`reflection.ts`) appends its
  synthesised insights.

**The unoffered GM tools were deleted on 2026-10-23** (decision 128): a call
to one by name gets "Unknown tool", and `tests/gmTools.sixPlaces.test.ts`
holds the six places a tool lives together.

**Removed — do not build new features assuming these are live** (see
`docs/game-mechanics.md` "What Changed"):

- Momentum (reroll/guarantee-success currency) — gone.
- The eight-system RPG picker, its client-side advantage/disadvantage and
  `rpgSystems.ts` — deleted.
- Structured stats, resources, inventory, abilities, relationships, variables,
  skill trees, the shop and upgrades, New Game+ and the game-over screen —
  deleted from `StoryData` on 2026-10-23 (decision 126; the keys are listed in
  `REMOVED_STORY_FIELDS`, `storyDataDefaults.ts`). An old save is stripped when
  it loads by `stripRemovedFields()`, which also reaches the nested places
  (presets, a note's variable triggers, `agmtState.threads`, a saved choice's
  arcade fields). The host sends older online guests six empty legacy arrays
  (`withLegacyGuestShim()`), so their Story Editor does not crash. Describe
  any of this in the character sheet note.
- Arcade tags on choices (`skill_used`, `item_used`, `agmt_check`, `table`,
  `rolls` and the rest): no parser reads them, and saved choices lose them on
  load.
- `Condition[]` — gone; injuries are narrative prose or `formula_roll`
  consequences. (`toggle_combatant_condition`, the combat-only toggle, is
  unrelated and live.)
- `Achievement[]`, `Quest[]` and the XP/levelling economy — gone; replaced by
  Goals and Story Threads with no points.
- `Passives` — gone.
- `CustomTable[]` / `StoryData.customTables` — kept only as migration input:
  `tableNotes.ts` and `tablesLibraryMigration.ts` turn old tables into
  `type: "table"` notes on load. Nothing else reads the field.

## Session zero: the setup has to happen before play

A new adventure starts in **session zero** (`StoryData.sessionZeroActive`),
and the GM may not narrate the story until setup is done (decisions 142–147,
`docs/session-zero-design.md`, `docs/session-zero-plan.md`; the step-by-step
walk-through is decision 148, `docs/session-zero-detail-design.md`).

**The state** is `StoryData.setup?` (`SetupState` in `structs.ts`, optional,
absent on old saves): `mode` (`quick` or `full`, set by the style buttons;
typing instead means quick), `conceptDone` (a setup question was answered),
`approval` (the hashes of the sheet(s) and plan the player approved),
`referenceTitles` (notes read during setup, newest first, at most 20),
`questionsAsked` (answered `ask_question` calls, counted as they happen),
`covered` (the creation steps asked and answered: `{ table: string[];
players: Record<string, string[]> }`, keyed by player id, `"solo"` in solo
play; absent means none) and `premadeFor` (the player ids whose sheet was
already populated when the style was chosen).

**The creation steps** (decision 148, `app/misc/setupSteps.ts`, `CreationStep`:
`id`, `label`, `group`, `scope` `table` or `player`, `hint`). `getCreationSteps(story,
players?)` returns, in order: `cohort` (only with two or more players), the
world steps `setting`, `tone`, `style`, `tone_safety` and `campaign` (campaign
slice 3: `style` is the campaign style, `tone_safety` the tone words plus lines
and veils, "none" counting; the older `campaign` tag keeps its name); the system's `creationSteps`
(`BuiltinSystem.creationSteps`); or, for a story with no system but an enabled
`mechanics` note, one `abilities` step; then `name_look`, `history` and
`drives`. Blood & Bone's nine system steps (`blood-and-bone/creationSteps.ts`)
are `kind`, `archetype`, `stats`, `vow`, `connections` (both connections, one
tag), `burden` ("none" counts; its hint says to state the starting Stress),
`power`, `path` and `gear`. Stress is a rule the GM states, not a step.
**Required:** full mode, every step; quick mode, `setting`, `tone` and `tone_safety` only; no
mode chosen (an old save, a bare story), none. `creationTotal()` counts the
table steps once and each player step once per player who needs it. A player
with a pre-made sheet (`premadeFor`) is skipped for the player steps.
- **Kinds and the fields code sets** (gm-prompt-plan slice 3): every step
  has `kind` (`"choice"` or `"creative"`, optional, default choice, read through
  `stepKind`; creative is the player's own words: the shared world and self
  steps, every Fantastic Realms step, Blood & Bone's vow, connections and gear).
  `prepareSetupQuestions` (`gmExecutor.ts`, from `executeAskQuestion`) sets
  `allow_custom: true` on an item tagged with a creative step, and in full mode
  refuses the call (`success: false`, nothing asked) when the first item under a
  known tag has no `intro`.
- **Recording** (`recordCreationSteps`, `gmExecutor.ts`, run by
  `executeAskQuestion` in session zero). A tag counts only if it is a step of
  this story (an unknown tag is ignored and the result lists the valid ones),
  every item carrying it was answered (a skip is not counted), and a player step
  names its player: the solo player, or the item's `target_player_name`. A table
  step counts whoever answers. Several items under one tag count together, once
  all are answered. In full mode a call that mixes a player-scope tag with
  another tag refuses the player tag ("ask one setup step at a time"); the table
  tags in it are still recorded. Quick mode takes any mix. The result reads
  "[Setup: Recorded: connections (Nik). Next: burden (Nik).]", so the GM sees
  progress between rounds (the live block is built once per turn).
- **What the engine can know:** that a step was asked and answered under its
  tag, not that the question was good. The hint for each step is in the prompt.
- **Sheet and campaign steps** are not tagged: the sheet or campaign being
  written satisfies `character` and `campaign`, not `interview`.

**The steps** are derived by `getSetupProgress(story, players?)`
(`campaignPlan.ts`), which returns the five flags, `next`, the first step
not done (`interview`, `concept`, `character`, `campaign`, `confirm`,
`start_game`, or `null` once started) and `creation` (`covered`, `total`,
`missing`, in step then player order):
- **Interview:** `next` is `interview` while any required creation step is
  missing, ahead of `concept` (the implementation log's choice; the design had
  it before `character`). The gate and the engine line then name that step.
- **Concept:** `conceptDone`, a populated sheet, or any creation step covered.
  `mode` plays no part.
- **Character:** each player who needs one has a populated, enabled
  `character_sheet`. Solo play needs one. Couch co-op and party need one per
  player, matched by `ownerCouchPlayerId` or a "Character: <name>" title
  (`missingSheetFor` names the rest).
- **Campaign** (`campaignRecordReady`, `campaignPlan.ts`, campaign slice 3): a
  campaign record with a `style` and at least one part beyond the pitch
  (`hasPartBeyondPitch`, `campaign/styles.ts`: a faction, front, clock,
  person, secret, location, beat or end state; safety does not count), **or**
  an enabled `gm_plan` note, for older stories. A record the timer migration
  made (`origin: "migrated"`) never counts, so readiness follows the plan note
  until the record gains a style. A stale `planState` alone does not count.
  The style's other expected parts (`STYLE_SPECS`) only warn.
- **Approved:** `approval` is set and its hashes match the current sheet(s),
  plan note and campaign record (`currentSetupHashes`, `hashNotes`: a stable
  FNV-1a string hash, no crypto API). `campaignHash` (`hashCampaignRecord`) is
  the third hash, present whenever the story has a campaign record (any origin); it covers the
  whole record, secrets and dooms included, minus play state (a clock's fill
  and crossed portents, found clues, revealed secrets, `paused`). Any later
  edit cancels the approval.
- **Started:** `sessionZeroActive` is false.

**The block.** While `sessionZeroActive`, `buildSessionZeroBlock(story)`
(`ai_staged.ts`) is the only setup text, in the **live block** (the cache
rule). It replaces `freshStorySetupBlock`, `sessionZeroStartGameReminder`,
`setupOverdueBlock` and `buildSheetTemplateBlock`, which still fire outside
session zero. It holds, in order (reference first, the next step last; slice 3
of `docs/gm-prompt-plan.md`): the checklist, the step list, the system's
creation rules note, the setup reference, the sheet template, the CAMPAIGN guide
(`campaignSetupGuide`: the seven
styles until one is chosen, then the style's expected parts with what is built
and what is not, the clock triggers that suit it, the `campaign` tool's parts
and the lines-and-veils hint), the rule that the GM does not narrate until
`start_game` succeeds, the mode's lines, the asking rules (tagging, the one
batching chain by scope, intro; `creationRules`), after
6 setup questions (`SETUP_QUESTION_NUDGE_AT`) a nudge to propose, and last the
one next-step pair (`setupNextStep` and `creationNextStep`). The checklist
gains a "Setup steps (n/m asked and answered)" row when the mode requires steps,
and the block lists each required step per player with ✓ (covered), → (next) or
· (still to come). The creation rules say to tag every covering item with
`setup_step`. In full mode they add one batching chain by scope (a table step
may share a call with other table steps, a player step is asked alone), an
`intro` the engine requires, options that say what they
do in play, 2–4 suggestions (the engine sets `allow_custom` on creative steps), and
`target_player_name` on every player-step item. In full mode the nudge is
replaced by "every step is covered: write the sheet and build the campaign" (quick mode
keeps the nudge at 6).
- **Template precedence:** the story's own `characterSheetTemplate` if it has
  one, else the resolved system's `sheetTemplate`. An explicit template always
  wins.
- **Creation rules:** the system's `creationNoteId` note
  (`builtin:blood-and-bone:character-creation` for Blood & Bone), in full, if
  the story holds it and it is enabled. Carried in quick mode too, for
  grounding.
- **Setup reference:** the notes read during setup, carried whole, newest
  first, up to `SETUP_REFERENCE_CAP_TOKENS` (6,000). The first note that would
  pass the cap, and every older one, is listed by title with the usual "read it
  again" line. `read_notes` records its titles with `recordSetupReference()`,
  only during session zero.
- History is not touched. The history stubs are the same as before, and the
  block and reference leave the request at `start_game`.

**`confirm_setup({ character_summary, campaign_hook, story_name?, premise? })`**
refuses while a required creation step is uncovered (`Not yet: you haven't
asked Nik about connections, …`), and refuses without the sheet(s) or the
campaign (a ready record, or a plan note), naming which and pointing at the
`campaign` tool. Otherwise it pauses the turn like `ask_question`. The card (`app/components/SetupConfirmModal.tsx`, opened from
`requestSetupConfirmation` in `page.tsx`) shows the sheet(s) and the campaign
**from the executor's working copy**, passed with the request, not from page
state. The request's `plan` is `{ note?, campaign? }`: the plan note (older
stories) and/or `publicCampaignView(record)` (`campaign/publicView.ts`), the one
projection any player view uses (slice 6 reuses it): style, pitch, tone, lines
and veils as text, faction and front names, a front's stakes questions,
locations with features, visible clocks, found clues. It never holds a secret,
a doom, portents, dangers, a person's want, secret or voice, a hidden clock,
beats or end states. Its four outcomes:
- **Start the story** (`approved`): the executor stores `setup.approval` with
  the hashes of exactly what the card showed, then runs `executeStartGame` on
  the same working copy (`story_name` falls back to the current name unless it
  is empty or "New Story", then "Untitled Story"). It is one result, with
  `started: true` when the game started (`resultStartedGame()` reads that flag,
  never the text); the GM writes the campaign intro in the same turn. If the
  start is refused, the result is `approved` with `started: false` and the
  gate's approved-but-not-started path takes over.
- **Change something…** (`changes`): the player's note goes back to the GM,
  which edits and calls `confirm_setup` again. Any edit cancels the approval
  through the hashes.
- **Dismiss**, by the X, the backdrop or Back (`dismissed`): "The player closed
  the card; ask what they want to change." Dismiss is not Stop.
- **Stop**, the page's Stop button (`stopped`): cancels the turn (see the
  cancellation rule).

Only `approved` is `success: true`. Outside session zero the tool refuses with
"The game has already started." The card shows on the local screen (the couch's
shared screen, the party table, the online host). It is **never relayed** to
phones or guests.

**`start_game`** refuses unless Character, Campaign and Approved all hold on
the live state, and names what is missing; it also refuses while the
`tone_safety` step has never been asked (lines and veils may be "none", but they
must have been asked). A stale approval is named as one. The minimal
requirements are the only blockers: the style's other expected parts
(`styleWarningLine`, `campaign/styles.ts`) come back as a "Prep warning" line in
the result (part names only, safe for the narrator), and the authoring checks
that quote a secret's title (`campaignWarnings`) in `gmOnlyContext`, the GM's
alone.
Outside session zero it refuses with "The game has already started." On success
it clears `sessionZeroActive` and its result carries the campaign intro
(decision 144): a short briefing in the story's voice, then the opening scene,
ending on a clear first choice. When the adventure has an authored opening
it rides in that result, to be played after the briefing (decision 197). It is the direct path; a card OK starts the game
the same way.

**The setup gate** (`generation.ts`, `MAX_SETUP_PROMPTS` = 2). A session-zero
turn may end only if, that turn, the tool **results** show progress: an
answered `ask_question`; a `confirm_setup` that ended as `approved`,
`changes` or `dismissed` (a refused or stopped one is not progress); a sheet
or plan `create_note` / `edit_note`, or a `campaign` write, that changed the
setup hashes (a read, a refused write or a tick does not); or a
successful start (`start_game`, or a card OK that started the game). An
approval whose start was refused (`approved` with `started: false`) is a
violation even though approval is progress, because the setup is not finished. On a violation the turn's round is taken back out of every store
it reached, and the GM gets `setupGateMessage(next, creation, { cause, rejected, multiPlayer })`:
the cause (`classifySetupRejection`: `prose_question`, `prose_note` or `nothing`), the
rejected text quoted back in whole sentences, `target_player_name` only when several
players are at the table, then the next step and its tool, with `tool_choice: "required"` unless the model rejects a forced choice
(Qwen 3.8, `gmModelRejectsForcedToolChoice`). Claude and Z.ai are downgraded to
`auto` in `providerCall.ts`, so for them the message is the only forcing.
- **No fail-open.** After 2 re-prompts the turn ends on
  `setupEngineLine(next)`, with no narration. Since decision 195 that line
  hands the floor back: "Next up: your character sheet. Anything you want me
  to know before I write it? Or just say go on." The round-limit path has the
  same guard.
- **A round cut off at the output cap** (finish reason `length`) with no words
  and no finished tool call is asked again once per turn at double the cap,
  which then holds for the turn (`roundCutOffEmpty`, decision 196). It is not
  a gate prompt and not a round. It applies on every turn, not only setup:
  Claude's thinking counts against `max_tokens`, so at `xhigh` it could spend
  the whole Response Length before writing the sheet. The two caps are
  compared as sent (`sentMaxTokens`, after the 4,096 thinking floor), so no
  twin request is paid for; the input budget still reserves only the 1x cap,
  and the `claude` CLI path reports no finish reason, so it never retries.
- **No narration stage** while session zero is on and `start_game` has not
  succeeded. The turn's text is the GM's own prose, or the engine line when
  the gate gave up or the text is empty.
- **Other gates off.** The M2 roll gate and the plan gate are off for a whole
  session-zero turn, including the round that calls `start_game`. They apply
  again from the next turn.
- **Buffering.** Until `start_game` succeeds, the live callbacks
  (`onGMContent`, `onLiveNarrationUpdate`) are held. The validated text reaches
  the timeline, online guests and read-aloud once, at the end. After
  `start_game` the text streams as usual, since no later round can be
  rejected. A rejected round's prose is removed from the turn's accumulated
  text, `gmThinking`, the context and the replayed history, so it is never
  shown, sent, spoken or kept. Outside session zero none of this applies.
- **Latest words only** (decision 148). Before the game starts, a setup turn
  shows only the latest round's text: the feed, `gmThinking`, live narration,
  read-aloud and the guests' callback. Earlier rounds' prose stays in the GM's
  own conversation, so an old "Step one: …" is never re-shown. At the start,
  the pre-start text is dropped (for a card OK and a direct `start_game` alike),
  and from then on prose streams as on any turn, so the intro can have prose
  before and after its tool calls.
- **An empty latest round** while setup is incomplete is not an end: the gate
  re-prompts with the next step, on the same counter. After the cap the engine
  line shows.
- **The card was closed or sent back.** If this turn's `confirm_setup` ended
  `dismissed` or `changes` and the GM then says nothing, the turn ends on
  `SETUP_CARD_HANDED_BACK_LINE`, "(What would you like to change?)", and the
  card is not forced open again.
- **Round limit.** A session-zero loop that hits `maxToolLoops` with its last
  round still a tool round ends on `setupEngineLine`, whether or not the turn
  made progress.
- **Retry.** A session-zero Retry or Reword runs the full GM loop, so the gate
  applies. The precomputed-results path is guarded: in session zero with no
  successful start, the narration call is skipped, and the saved text is the
  last assistant message whatever it called (an empty one gives the engine
  line, naming the step).

**Cancellation.** A Stop during any pause (`ask_question`, `confirm_setup`, a
dice request) commits nothing from that batch and runs no later tool.
`executeGMTools` checks the turn's abort signal before and after every tool and
returns `aborted: true` with the input story. `generation.ts` then throws
"Generation cancelled by user" before it merges anything.

**The strip and the style choice.** `SetupStrip.tsx` shows above the composer
while session zero runs, from the pure `setupStripState(story)`
(`app/misc/setupStrip.ts`). Until `setup.mode` is set it offers two buttons,
"Quick setup" and "Step by step". `handleChooseSetupStyle` in `page.tsx` sets
the mode and sends the player line from the same updated story object, and
typing first picks quick through the same path. Then the checklist shows
Concept, Character, Campaign and Start (Start ticks on approval). In full mode
a "Setup n/total" item sits after Concept, ticked when every required step is
covered (`setupStripState`; 17 for a solo Blood & Bone build, 30 for a couch of
two); quick mode keeps the four items. Character and Campaign open their notes
(Campaign opens none for a story whose campaign is a record only). It hides while a turn is loading. Online guests get
it read-only, with no buttons and no note links. Party phones do not render it.

**`ask_question` with `multi_select`** (decision 146). The question shows
checkboxes and a Done button in `AskQuestionModal.tsx`. The answer item carries
`selectedLabels`. The executor (`gmExecutor.ts`) and the party host
(`partyHost.ts`) keep only offered labels, once each, in option order, and the
GM's line reads `→ "A", "C"`. Any custom text the player typed is kept
alongside the picks (the box shows unless the question sets `allow_custom: false`; in session zero a creative step's items are always given it, `prepareSetupQuestions`). `selectedLabels` is honoured only on a multi-select
question. The phone protocol caps picks at 4 (`PARTY_MAX_PICKS`). Couch
`target_player_name` routing is unchanged.

**The question's `intro`** (decision 148) is shown above the options in
`AskQuestionModal.tsx`, whose body scrolls inside a bounded height, so the
controls stay reachable with the keyboard open. On party phones it travels as
`intro` in `PartyRequestView` (`party/protocol.ts`, added by `partyHost.ts`) and
`PartyController.tsx` shows it; `party.redaction.test.ts` covers it.

## The creator is conversational — a Game Designer, not a Game Master

Authoring an adventure means talking to a **Game Designer** AI, a
deliberately different character from the play-time GM. The GM runs a story
for a player and never breaks fiction; the Designer talks to the *author*
about the adventure as a designed object and writes the material the GM later
improvises from. The prompt is `app/misc/designer_ai.ts`.

- `designer_tools.ts` — 13 tools, all targeting things the GM actually reads:
  `set_adventure_info`, `set_premise`, `write_note` / `delete_note` (one tool
  for every `LoreType`, including the mechanics note, the character sheet and
  random tables), `write_npcs`, `write_goals`, `set_starting_choices`,
  `write_presets`, `set_character_sheet_template`, plus deletes, and
  `write_campaign` (slice 4 of `docs/campaign-format-plan.md`): `add`, `edit`
  or `remove` one part of the campaign record, run through the GM tool's own
  executor and `validatePart` against a stand-in story built from the draft
  (`app/misc/campaign/designer.ts`, `applyDesignerCampaignWrite`), on a deep
  clone, so a refusal leaves the draft byte-identical. `AdventureDraft.campaign`
  is carried by `draftToAdventure` / `adventureToDraft` into
  `storyTemplate.campaign`, `startAdventureLocally` hands each story its own
  copy, Restart restores it (`resetCampaignPlayState`), `summarizeDraft` lists
  every part with its id plus `campaignWarnings` (no style; a mystery secret
  under three clues; a front with no clock), and the Adventure Inspector has a
  Campaign section (read-only, a remove button per part). The prompt now says
  what session zero does, what the campaign record and its styles are, that
  notes are read by title (not keyword), and names the starters as the examples.
- `designer_executor.ts` — the deterministic half. Owns `AdventureDraft`,
  applies tool calls to a *copy* so a malformed call can't corrupt the draft,
  and converts with `draftToAdventure` / `adventureToDraft`. It forces
  `mechanics` and `character_sheet` notes `alwaysOn`, but the GM prompt never
  reads that flag: character sheets load in full by type, and rules notes
  are listed by title (§6.15). Its adventures carry none of the removed
  arrays (the types have no fields for them). `ensureStoryDataArrays()`
  backfills the arrays the GM reads and strips the removed fields when a story
  starts or loads. A starting choice's `intro_override` skips the GM only after
  `start_game` (see the `start_game` bullet above).
- `useDesignerSession.ts` — the bounded tool loop (`MAX_TOOL_ROUNDS = 5`), the
  chat transcript, the IndexedDB save, and `importFromLibrary()`, which merges
  notes picked from the notes library (`LibraryPickerModal`) into the draft
  by `importLibraryNotesIntoDraft()` (designer_executor.ts). Every import
  path (this one, the lore editor, a started adventure) uses the one rule
  `mergeImportedLore()` in `localNotesLibraryManager.ts`: match by
  `libraryNoteId`, else by title against unlinked notes. The picker also
  lists the **built-in rules packs** (`app/misc/systems/`) as virtual
  folders, and importing one into a draft with no sheet template adopts the
  system's. A draft carries `meters`/`progressTracks` through untouched so
  a built-in starter opened as a copy (Library home, "Open a copy in the
  Designer") keeps them. The Designer learns about imported material
  through `summarizeDraft()`, not the transcript. It calls the model through
  `callSideModel()`, so it works in the native apps. The Google filter strips
  its tools (§6.14).
- `AdventureInspector.tsx` — hand editing (its Rules section also holds
  the three-way switch for the system tools: automatic, on, off). The AI's tools and the inspector
  write to the same draft, and `summarizeDraft()` re-injects live state each
  turn, so the Designer treats the author's manual edits as authoritative.

The old creator — a 12-step wizard, a staged batch generator,
`creator_tools.ts`, `creator_ai.ts`, `story_creator_ai.ts`, the
`CreatorAIChat` sidebar — is **deleted**. Don't restore it. `jsonRepair.ts`
survives because the OCR pipeline uses it.

## Pictures in play

Built in PR I1 (`docs/image-generation-design.md`, the plan, decisions 54–61
and 109). **The bytes never go in `StoryData`**: they live in their own
IndexedDB database (`imageStore.ts`, the `ttsAudioCache.ts` precedent,
decision 59), and `StoryData` holds only ids (`ScenePart.images`,
`NPC.portraitImageId`, `StoryLore.imageId`, `playerPortraitImageId`). Pictures
do not sync; another device shows a placeholder with Regenerate, and an online
guest sees "Picture on the host's screen" (decision 60; guests are PR I2).

- **One queue, one store, one card.** Every picture is a job on
  `imageJobs.ts` (one at a time, FIFO, one retry on a busy fal), whoever asked:
  the GM's `generate_image`, the Illustrate this button, the portrait buttons,
  Regenerate. A job writes its result against the *current* StoryData
  (`deps.patchStoryData`), logs a Debug Logs line for every terminal state and
  bills the turn that asked (the `image` stage, recorded at the catalog price,
  since fal returns none). `StoryImage.tsx` shows it, full width and
  frameless in the feed, with the cost, the model and Regenerate in its
  full-screen view (portalled to `<body>`); `useStoredImage()` is the hook for
  portraits and notes.
- **The engine disposes.** `executeGenerateImage` (`gmExecutor.ts`) checks the
  key, the per-scene cap (`StoryData.imageState`, reset by `computeSceneKey`),
  that the NPC or note exists and has no picture yet, and trims `featuring`;
  the call answers at once. The turn's part does not exist yet, so the card
  reaches the page through `onSceneImageRequested` and the part's id is
  allocated up front (`scenePartId`).
- **Providers.** fal (`falImageCall.ts`: `POST https://fal.run/<model>`,
  `sync_mode`, through `getProviderFetch`; the desktop allowlist has
  `https://fal.run/*`), else DeepInfra, else OpenRouter through the lore-image
  path (`generateImageCall.ts`, `plainPrompt`). `imageProvider.ts` picks the
  provider and, by job, the model (decision 61). Settings: `imageSettings.ts`
  (synced), the Images tab, and the Story Editor's Pictures block.
- **Not built yet: reference pictures (S7).** `resolveReferencePictures` is the
  stub; it waits on the live fal checks in `docs/pending_tests.md`.

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
`[[HIDDEN_LORE]]` markers; `stripHiddenLoreContent` is called by the narration
context (§6.16), so a narrator or rewrite never receives that text, though the
GM's own inline prose is written with it in view. Fields
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
`consistencyCheck.ts`, free and diagnostic only: Debug Logs and the turn's
details, no toast, and a name only counts in its own clause; the Observer in
`observer.ts`, **every judge on by default, held output** (decisions 187–189, 220–221, below); and the
M2 roll-invariant gate that forces a re-prompt if a gated scene
ends with no roll).

**The Observer rewrites only text the player has not seen, and never rerolls**
(decisions 187–189, revised by 220–221; `docs/judge-layer-design.md`, Codex's
review in `docs/research/codex-judge-layer-review-2026-10-24.md`).
`DEFAULT_OBSERVER_SETTINGS` (frozen; every reader gets a copy, `settingsFor`,
`cloneDefaultObserverSettings`) has **every judge on** (decision 220): the three
prose judges (length, agency, outcome) rewrite a flagged turn automatically
(`triggersReset`), the others flag (and the three judges of the record added by
judge layer v2, world consistency, secret leak and lines and veils, default to
flag and offer "Rewrite automatically" too: all six are `REWRITABLE_FLAG_TYPES`).
Since slice J3 **no rewrite happens on one judge's word**: a judge of another
model family must confirm it first (see J3 below). A stored
config without `observerSettingsVersion: 3` (`OBSERVER_SETTINGS_VERSION`) is
replaced by the defaults once, with a Debug Logs line (`getObserverSettings`,
`layerSettings.ts`); a player's later choices are kept, and the flag-only table
of decision 187 is one Settings choice away (`FLAG_ONLY_OBSERVER_SETTINGS` in
`tests/helpers`). Settings shows each judge as Off / Flag, and for the prose
judges "Rewrite automatically". **A turn the judges may rewrite is held
(decision 221):** `generateStoryTurn` sets `holdTurnText` (not in session zero;
`canObserverTriggerReset`), passes `holdLiveText` so `onGMContent` and
`onLiveNarrationUpdate` stay silent (reasoning and tool results still flow;
session zero's own `setupTextHeld` is separate and its "latest words only"
clearing does not apply), and wraps the attempt's callbacks in
`createHeldTurnOutput` (`heldTurnOutput.ts`), which queues `onStoryStart`,
`onStoryContent`, `onStoryComplete`, `onChoicesStart` and `onChoicesComplete`.
After the judging it `release()`s the text once (as the rewrite when one was
made, *before* `onObserverRewrite`, so the page's part exists; the page is told
`onStoryStart(false)`, since the held GM prose never streamed), drops or flushes
the queued choices, and a reset `discard()`s the attempt; a Stop flushes
nothing. `onTurnPhase` ("writing", "checking", "revising") feeds the work line.
When every judge can only flag, nothing is held and text streams live. **The
background wave never rewrites** (`onBackgroundObserverRewrite` and
`applyBackgroundRewrite` are gone): it only flags, and it runs only the judges
the blocking pass did not (`splitObserverSettings`: the blocking pass runs the
enabled-and-rewriting judges, the wave the rest, so each runs once per turn).
`player_agency` has no free pre-signal, so `plausibleResetFlagTypes` lists it on
every turn with a non-empty player line while it is enabled and rewriting
(decision 237), which makes such a turn wait for one cheap call. **A pause
releases first** (decision 240): when the GM's loop is about to pause on the
player (`ask_question`, `ask_for_roll`, a dice throw, `confirm_setup`), the
four handlers `generateStoryTurnOnce` passes to `executeGMTools` are wrapped by
`beforePausing`; `GenerationOptions.beforePause` (set by `generateStoryTurn`,
not in session zero) judges the prose written since the last release with the
verdicts so far, rewrites it on a major flag, and the prose is then shown
through `onGMContent` / `onLiveNarrationUpdate` and kept as the first entry of
the accumulation. The end-of-turn pass judges and rewrites only the tail after
it, and `held.release(text, pause.text)` adds only the tail to the live view.
The released prose goes into the finished text verbatim (never polished twice),
and a pause rewrite is applied to the GM's own rounds in `conversationHistory`
(`replaceVisibleProse`; thinking, tool calls and `reasoning_details` kept).
A tier retry is refused once anything is on screen. A choices call that fails
no longer throws the turn away (`runChoicesGeneration` logs and uses none). See
`docs/judge-layer-design.md`'s 2026-10-25 note.
`missing_oracle_or_table` and `missing_scene_increment`
are flag-only by type (`FLAG_ONLY_FLAG_TYPES`; `settingsFor` reports them
unable to reset), and `rewriteFlaggedNarration` returns null for them and for
`tier_escalation_missed`: a missing tool is never "corrected" by words.
A rewrite is checked before it replaces anything
(`validateRewriteResponse`: not truncated, no tool calls, not a refusal or an
introduction, non-empty after `extractVisibleText`, not the original
unchanged); a failed or rejected rewrite **keeps the turn with its flag** and
never rolls back or rerolls the dice; the only full-turn retry left is
`tier_escalation_missed`'s heavier-tier one, reachable only by settings that
set its `triggersReset` directly (Settings no longer offers it) and refused on
the reword path (`GenerationOptions.allowMechanicalRetry: false`, so a
saved conversation's mechanics never run twice). The outcome judge is given
typed verdicts only (`extractOutcomeVerdicts`: `action_roll` and
`progress_roll` tiers, `record_challenge_result`, and a `calculate` only when
it held a comparison and evaluated), each on its own numbered line; the
turn-wide "mixed results are advisory" cap is gone. A length-judge call that
fails or can't be parsed is "unknown", not a flag, and a Stop (`AbortError`)
passes through every judge. **A late result from the background wave is a
patch, never a captured whole-story object** (`backgroundPatch.ts`): flags go
to a part by id, and memory, director and progress changes arrive as a
`BackgroundLayersDelta`; the page applies them to the current story through
the picture queue's `applyStoryPatch` host (`buildPatchHost`). `regenerateChoicesFor`
makes no call when Suggested Choices are off. The page's turn lock is
`turnInFlight` (`app/story/turnLock.ts`), held by `generateTrackedTurn` until
`generateStoryTurn` returns, so no stage callback releases it, and read-aloud
waits for the outer `onComplete` only when a judge may rewrite (which now fires right after the release). Every side call
is on the cost ledger: one cancelled before it answered (or unreadable) is an
entry flagged cost-unknown (`recordUnansweredSideCall`). The player's view of
a note the GM read shows "(hidden note)" for hidden and secret text
(`redactForPlayer`, `turnTimeline.ts`); the full text stays in the Debug Logs
and the context viewer. "Undo revision" is attached to each revised turn
(`onUndoRevision`, `restoreObserverOriginal(partIndex)`). Read `docs/architecture-frontier.md` before proposing new
work in any of these layers — it tracks what was tried and reverted, and why.

**Judge layer v2, slice J1: rung 1 and the re-ask** (`docs/judge-layer-v2-design.md`
§11, plan slice 1; the combined call is J2 and confirmation with the rewrite
with facts is J3, below). `app/misc/judges/` holds the facts
(`collectTurnFacts`, ids `f1…fn` with source and time), the pure rung-1 checks
(`runRung1`: event contracts, dead or departed people, campaign lines, secret
key phrases, and the pacing counters) and `buildReask`. A system declares event
contracts (`BuiltinSystem.eventContracts`); Fantastic Realms' `foe-damage` says
a landed `feat_roll` that names a `target` foe owes that foe's Hearts meter the
damage `foeDamage` gives (the *requested* change, so a clamp is no violation).
`generateStoryTurnOnce` runs rung 1 on the GM's final round beside the turn-end
checks: a **verified** hit with a fix sends the GM back **once per turn** (one
appended user message, `tool_choice: "auto"`, at least two rounds left, off in
session zero and for a repetitive round), the re-ask round **never runs a dice
tool** (a refused call gets an `[ERROR]` result, `mergeRefusedDiceCalls`), and a
line's re-ask is answered with new prose that replaces the draft (the draft is
given back if the GM answers with no words), while a tools-only contract re-ask
keeps the draft and drops the acknowledgement. After narration the same checks
run once more for the Debug Logs; the pacing hits make a GM-only
`ScenePart.pacingNote`, carried into the next live block under the story-progress
check-in (decision 235).

**Judge layer v2, slice J2: the combined judge call** (`docs/judge-layer-v2-plan.md`
slice 2; confirmation and the rewrite with facts are J3, below).
`runObserver` no longer makes one call per judge: every judge whose
precondition holds (`selectJudges`: length past the ceiling, agency with a
player line, outcome with a typed ruling, world consistency when the prose names
a person or place of the record, secret leak with an unrevealed secret, lines
and veils with a line or veil, the oracle judge when no oracle ran, the tier
judge below the top tier) goes into **one** `callSideModel` call per pass (the rewriting judges before release, the rest in the background wave, one more per pause)
(`judges/combined.ts`, prompts in `judges/prompts.ts`) on the side-agent model
at its explicit effort. The prompt is written to the prompt rules (decision
238): each judge a numbered decision chain with a minimal pair (`RUBRICS`; the
agency chain is the shared `AGENCY_CHAIN`), the turn's facts first, each in its
own fields (`collectTurnFacts` now tags `topic` and `names`, adds the character
sheet and the record's people-at-locations; `selectFactsFor` hands a judge only
its kinds), the narration last, and a keyed JSON reply whose facts-shaped
fields and reasoning come before the verdict. `parseJudgeVerdicts` trusts a
verdict only when its severity is in the set, its quote is really in the
narration (the player's line for the tier judge) and every fact id exists;
anything else, a missing key and malformed JSON included, is "unknown": no flag,
a Debug Logs line. Facts are never truncated: past about 3,000 tokens the call
splits into two by judge group (`planCalls`). A judge's free-text `fix` goes to the corrective prompt and the Debug Logs only: every flag `detail` the player can see is a fixed sentence per judge. A Stop passes through; a failed
call is unknown. The scene-increment question is a free phrase check
(`sceneIncrementFlag`), not a judge. The per-judge calls survive as
`runObserverSplit`, reachable only from the eval runner (J4, below), never Settings.
**Every correction goes through one path:** the speculative length rewrite is
gone, several major flags are acted on in `FLAG_PRIORITY` order (lines and veils,
secret leak, outcome, world, agency, length; `pickMajorFlag`), and the full-turn
tier retry is refused when the turn already threw dice (`executedRandomness`).
The three new judges default to Flag (J3 made them rewritable on request); an
older stored config that does not name them reads their defaults
(`ObserverSettings` lets the newer types be absent), so no settings-version
bump. A secret-leak flag is generic and never quotes the secret; the quote
stays in the Debug Logs.

**Judge layer v2, slice J3: confirmation and the rewrite with facts**
(`docs/judge-layer-v2-plan.md` slice 3, design §11.5, decision 228 and 234).
**A rewrite needs two families.** Of a pass's major flags the player let
rewrite (`REWRITABLE_FLAG_TYPES`, now also world consistency, secret leak and
lines and veils), the two of highest `FLAG_PRIORITY` (`MAX_CONFIRMATIONS`) are
each re-judged by the confirming model (`judges/confirm.ts`: the same single
judge's rubric through `callJudges`, run together). It **agrees** on a major
verdict whose quote overlaps the first judge's (`evidenceOverlaps`: a shared
run of three words). The model is the player's pick
(`getRewriteConfirmModel`, `rewriteConfirmModelOverride`, a synced key, picker
"Rewrite confirmation" under Settings → AI → Advanced), **GLM 5.3** by default.
A pick that cannot run (no key, a model of the first judge's family
(`confirmModelFamily`, read from the catalog; a custom model's family is its
OpenRouter id's vendor), or a subscription model off the desktop or in an online
session) **falls back**: the first catalog model the player has a key for, of
another family and not a subscription model (`resolveConfirmModel`; logged, and
Settings' subscription notice lists the card). Only when none exists is there no
confirmer, and then `generateStoryTurn` resolves that once per turn, before the
hold decision, and runs the rewriting judges as flag-only for the turn
(`flagOnlyRewritables`): nothing is held, they are judged in the background
wave. A confirmation that fails or cannot be read is
"unknown", never a rewrite; a Stop passes through. `judges/correction.ts`
(`confirmAndRewrite`) is the one path for the end-of-turn pass and the pass
before a pause: confirm, then **one** rewrite (`rewriteFlaggedNarration` with
`findings`, on the narration voice and the narration context) addressing every
confirmed finding. `alsoFixIfPresent` and the speculative "fix this too"
clauses are gone. **The rewrite is handed facts, never secrets**
(`rewriterFactsFor`): only the facts the finding cites, of kinds the judge's
rewrite may use (outcome: results; world: people, places, results; lines and
veils: the line and veil text), never a secret's truth, a clock, the sheet or a
person the prose does not name. A tool result is a fact only as its
`publicSummary` (`collectTurnFacts`), so a hidden roll is no fact at all and an
NPC roll's reason is stripped, for the judges (whose `fix` reaches the rewrite)
as well as the rewrite. A secret-leak rewrite is told only the quoted statement to
take out. It replies with a **fix plan** (a JSON array of
`{span, problem, replacement}`), the line `===PROSE===`, then the prose
(`judges/rewritePlan.ts`): `parseFixPlan` rejects a span that is not in the
original, `planFollowed` a replaced span of four words or more that is still
in the prose, `validateRewriteResponse` the usual cut-off, refusal or
unchanged text, and `recheckRewrite` runs rung 1 on the new text (a line's
keyword or an unrevealed secret's key phrase, or a dead person acting that the
draft did not have, fails it). Any failure releases the original with its
flags, exactly once. **Public and private:** a flag made by the combined call
carries `ObserverFlag.finding` (quote, fact ids, the judge's `fix`; none for a
leak or a line); a rewrite original keeps its flag's kind only
(`kindOnlyFlag`); `ScenePart.publicNotice` ("checked" or "revised") is all the
player is told; the toasts and the Undo tooltip are generic ("Revised after a
check", "Undo revision"); and `withoutPrivateFindings` strips
`observerFlags`, `correctedObserverFlags` and the replaced draft from what the
host sends online guests (`broadcastSnapshot`; `buildPlayerView` never had
them). The turn's details do not show the notice yet (slice 5).

**Judge layer v2, slice J4: the labelled turn set and its runner**
(`docs/judge-layer-v2-plan.md` slice 4, decisions 229 and 233; `evals/README.md`).
A turn is a versioned JSON fixture (`judges/evalFormat.ts`: `kind: "judge"`
holds the story before and after, the tool results, the player's line, the
narration and `labels` of `{judge, severity, span}`; `kind: "generation"` is
defined for the GM prompt plan's runner and not run here). The facts, typed
rulings and key-phrase hits are rebuilt from it by the app's own code
(`judgeInputsOf`), so a fixture never stores a derived fact; a file with
key-shaped text is refused. **`evals/turns/public/` holds 45 invented turns**
(`labelStatus: "drafted"` until the author checks each label), every judge with
problem and good turns; the author's own turns go in only once approved (decision
233), the rest in a folder outside the repository named by `EVAL_TURNS_DIR`.
`scripts/export-eval-turn.mjs` drafts a fixture (`labels: []`, `published: false`)
from a story export or a "Copy GM context" download (`judges/evalExport.ts`).
`scripts/eval-judges.mjs` runs each judge in its combined form
(`runCombinedJudges`) and its split form (`runObserverSplit`, five judges) on
every turn, `--runs 20`, through `callSideModel` on the keys in a gitignored
`.env.eval`; **it makes no call without `--go`, never runs in CI, and every real
run waits for the author's go**. It prints and writes `evals/results.json`
(`judges/evalRunner.ts`, `evalScore.ts`): per judge precision (any flag and
major only), recall and false-flag rate as counts with denominators, the failing
runs per turn, a judge under 0.7 precision at major marked flag-only, cost,
tokens, cache hits and p50/p95 time by turn kind, and combined against split. A
private turn is counted, never named. The deterministic rung-1 checks are
asserted over the published turns by `tests/judges.evalSet.test.ts` (free).

## BYOK, no accounts, local storage, native shells

- **There is no auth, no account and no database of the player's data.**
  `app/layout.tsx` wraps only `NotificationProvider` and `APIKeysProvider`
  (plus `FeedbackHost`, the one feedback form). The one thing the developer
  stores is **feedback a player chooses to send** (decisions 190–194,
  `docs/feedback-design.md`): `POST /feedback` on the sync Worker, into
  Cloudflare D1 (`sync-worker/src/feedback.ts`, the migration in
  `sync-worker/migrations/`), kept 180 days, read on the Worker's private
  `/feedback/admin` page behind `FEEDBACK_ADMIN_TOKEN`. A submission is an
  allowlist (`app/misc/feedback.ts`: rating, text, kind, system/starter,
  version, platform, and an optional turn the player previews: their line,
  the visible prose, one-line roll summaries, the model), never reasoning,
  tool results, notes, memory, the sheet or keys. The app's
  `validateSubmission` and the Worker's `parseSubmission` are two copies of
  one schema, held together by `tests/feedback.schemaAgreement.test.ts`;
  change both. The entries (a turn's actions, the Library's built-in rows,
  the story menu, Settings → Game, the after-a-night card) show only when
  `NEXT_PUBLIC_SYNC_API_URL` is set, never for an online guest or on a party
  phone; the card also never in couch, party or online play.
- **AI is BYOK, always.** Keys live in the player's storage, read through
  `useAPIKeys()` (`APIKeysContext.tsx`): six LLM keys (OpenRouter, DeepSeek,
  Google, Mistral, DeepInfra, Z.ai) plus Cartesia, ElevenLabs
  and fal.ai (pictures in play; kept on the device, sent only to fal, never
  synced and not in `pickProviderKeys`, decision 58). **The Z.ai key is for Z.ai's general pay-as-you-go API only**
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
  encrypted blobs in Cloudflare KV through a Worker (`sync-worker/`, which
  also takes feedback, above,
  `syncManager.ts`, `NEXT_PUBLIC_SYNC_API_URL`); the server never sees the
  plaintext.
- **The native shells.** `NEXT_PUBLIC_STANDALONE=true` builds the static
  export; `isStandalone()` (`standalone.ts`) switches code paths;
  `providerFetch` and `getProviderFetch()` (`platformFetch.ts` — Tauri's scoped
  HTTP plugin on the desktop) reach providers without routes. In the Capacitor
  apps `capacitor.config.ts`'s `CapacitorHttp` patches `window.fetch` and sends
  each request through native HTTP, which reads the whole answer before
  returning it, so a chat request does not stream there and ignores its
  `AbortSignal`. The one exception is Android, for the hosts in `CORS_HOSTS`
  (`platformFetch.ts`, see the abortable fetch bullet below). A request whose
  answer is binary (the TTS audio) goes through `getBinaryProviderFetch()`
  instead, because the patched fetch reads a non-JSON POST answer as text. A browser
  permission the WebView asks for (the microphone) must be declared in
  `android/app/src/main/AndroidManifest.xml` and `ios/App/App/Info.plist`, or
  it is refused without a prompt. Every host the
  desktop app calls must be in `src-tauri/capabilities/default.json`; the
  opener plugin is scoped to `https://*`. The app's own Rust commands (only
  the `claude_cli_*` ones so far) are named in `src-tauri/build.rs`'s app
  manifest, so each needs an explicit `allow-*` permission in that file; a
  new command must be added in both places.
- **Android keeps a turn alive** (decision 132, `docs/android-background-design.md`
  §3.1). `TurnKeepAliveService` is a `dataSync` foreground service with
  `stopWithTask`, started and stopped by `TurnKeepAlivePlugin`, which
  `MainActivity` registers. `app/misc/turnKeepAlive.ts` is called from
  `generateTrackedTurn` in `app/story/page.tsx` with the turn's id: `begin`
  when the turn starts, and `end` only after the turn's final save has
  resolved, so "ready" means saved. The service posts "Endless Adventure is writing
  your turn…" while the turn runs. When it finishes, "Your turn is ready" is
  posted only for a turn that succeeded with non-empty prose, was saved and was
  not stopped, and only while the app is in the background. A turn that pauses
  on the player (`notifyPlayerNeeded`: ask_question, a manual roll, a dice
  throw) posts "The GM has a question for you" or "The GM needs a roll from
  you" while the app is in the background. Resuming clears both. Native calls
  are ordered by turn id: an `end` for an id that arrives before its `begin`
  wins, through `shouldStart`. `POST_NOTIFICATIONS` is asked once per device
  (`ys:turnKeepAlive:permissionAsked`) on the first turn, never awaited; a
  refusal hides the notifications and the turn still runs.
- **The interrupted turn** (decision 135, `app/misc/interruptedTurn.ts`). A
  record per story sits in localStorage (`ys:interruptedTurn:<storyId>`). It is
  device-only and not on the sync allowlist. The page writes it when a turn
  starts, and clears it once the turn's final save has resolved, on Stop, or
  when the page already reports the failure with its own Retry. Turns still
  running in this JS process are tracked in memory, so a live turn is never
  read as interrupted. On story load a record under 24 hours old cuts
  `scene.parts` back to `partsBefore` (`repairInterruptedStory`) and shows a
  banner: Retry sends the line again (`mode` "new") or runs the page's Retry
  (`mode` "retry"), and Dismiss clears the record.
- **The abortable fetch** (decision 134, `app/misc/platformFetch.ts`). On
  Android only, `getAbortableProviderFetch(url)` returns `window.CapacitorWebFetch`,
  the WebView's own fetch, for a host in `CORS_HOSTS` (OpenRouter, Mistral,
  DeepInfra, DeepSeek). That fetch streams and honours the signal, so Stop
  cancels the request. Every other host, and every host on iOS and the web,
  stays on the patched fetch. `providerCall.ts` sends every chat request
  through it, streamed or not. A `TypeError` before any response marks the
  host down for the session (`markHostDown`) and the turn fails. It is never
  replayed, because the POST may already have been billed. A new request header
  needs a new CORS preflight check first. The list and its preflight results
  are in the comment above `CORS_HOSTS`.
- **The back stack** (decision 133, `app/misc/backStack.ts`,
  `app/misc/useBackHandler.ts`, `app/components/NativeBackButton.tsx`). On
  Android, `@capacitor/app`'s `backButton` event runs the top registered close
  function, else the page's route back (`useRouteBack`), else
  `App.minimizeApp()`. Back never closes the app. Every dismissible surface
  calls `useBackHandler(open, onClose)` while it is open, with the function it
  runs on Escape or its close button. The shared primitives (`FullScreenView`,
  `ConfirmDialog`, the `StoryImage` picture, `StoryMenuSheet`) register inside
  themselves. **A new dismissible surface calls `useBackHandler`.** The
  story's route back declines during a live turn, so back minimises the app
  then, and a route back that returns false is treated as declined.
- **Multiplayer**: couch co-op on one device, and host-authoritative
  peer-to-peer online play (`app/misc/multiplayer/`, Trystero and PeerJS).
  The host broadcasts the whole `StoryData` to guests, GM secrets included,
  and `ask_question` is not relayed to guests (§6.12). In the native apps,
  "Copy invite link" copies a text invite with the room code (decision 7).
- **Party mode** (desktop app only; `docs/party-mode-design.md`, decisions
  21–28, 30 and 31): the desktop is the **table** and every player plays from their own
  phone on the home Wi-Fi. `src-tauri/src/party_server.rs` runs only while the
  table is open: it serves the phone page (`/party`, `app/party/`, a page of
  the static export) and a WebSocket, and **only relays text; Rust never
  parses a message or makes a game decision** (the four `party_*` commands are
  granted to the `main` window alone, through an app manifest in `build.rs`).
  The game stays in TypeScript, `app/misc/party/`: `partyHost.ts` is a pure
  state machine (spotlight on `floorControl` with party mode's own 15 s
  cooldown, a queue, Go, seats), `partyRuntime.ts` runs its effects against the
  server (`partyBridge.ts` is the one place that calls Rust), and
  `app/story/usePartyHost.ts` is the hook on the story page. **`buildPlayerView`
  is the only thing that builds what a phone receives, and it is the redaction
  boundary:** an explicit field list, never a spread of `StoryData`, with no
  secrets, `gm_plan` or `dm_instructions` notes, notes that aren't
  `always_reveal`, other players' sheets or keys; `tests/party.redaction.test.ts`
  proves it, so extend that test with anything new a phone is shown. A phone
  needs the spotlight to add any line (decision 26); rolls and questions the GM
  addresses by name go to that player's phone. The server needs the QR token,
  a private-range peer and the exact Origin, serves only `/party`, the favicon
  and `/_next/static/*`, and a phone on plain HTTP has no `crypto.subtle`,
  `crypto.randomUUID` or clipboard. Couch mode is untouched: its 4 s cooldown
  and PlayerBubbles' Generate payload (now `turnText.ts`) are byte-identical.
  The Android app joining and voice from phones are PR P2.
- **Environment**: the only env vars are `NEXT_PUBLIC_SITE_URL` (the
  OpenRouter HTTP-Referer), `NEXT_PUBLIC_STANDALONE` and
  `NEXT_PUBLIC_SYNC_API_URL`. Node ≥ 20.9.

## Directory map

- `app/misc/systems/` — the built-in default systems registry
  (`BUILTIN_SYSTEMS`: Blood & Bone in `blood-and-bone/`, then Fantastic Realms in `fantastic-realms/`), `resolveSystem()`, the
  `BuiltinSystem` shapes, and the converters the library uses
  (`builtinPackToLibraryNotes`, `builtinAdventureToLocal`). Built-ins live
  in memory and are never stored; `app/story/MetersPanel.tsx` is the
  player's panel at the top of the Lore page, and
  `app/library/BuiltinSystemsSection.tsx` lists them on the Library home. `app/misc/metersAndTracks.ts` is the pure meter,
  track and action-roll arithmetic.
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
  `stt/transcribe`, `creator/generate-image`.
- `app/story/` — gameplay UI: `page.tsx` (the orchestration shell, ~5,000
  lines), `story.tsx` (presentational: the feed, the edit panel and
  `StoryComposer`), `StoryTurn.tsx` (how a turn renders: `PlayerLine`,
  `GMTurn`, the folded work line, `TurnActions`, `prettify`), `turnWork.ts`
  and `playerLine.ts` (the pure helpers behind them), `StoryHeader.tsx` and
  `StoryMenuSheet.tsx` (the one-row header and the ☰ sheet that `MenuPage`
  renders in), `menu.tsx` and `menu/` (the in-story editors), `lore.tsx`,
  `npcs.tsx`, `goals.tsx`, `ContextViewer.tsx` and
  `LogViewer.tsx` (the debug views), `NPCReactionToast.tsx`. The design is `docs/story-screen-design.md`
  (decisions 112–117).
- `app/creator/` — the Game Designer: `page.tsx`, `DesignerChat.tsx`,
  `AdventureInspector.tsx`, `useDesignerSession.ts`.
- `app/library/` — folder-first browsing (`LibraryHome.tsx`,
  `FolderDetailView.tsx`), stories, adventures and the notes library.
- `app/components/` — shared UI: the dice tray (`DiceThrowModal.tsx`,
  `ManualRollModal.tsx`), TTS/STT controls, the API key modal,
  `PDFImporter.tsx`, the Settings tabs. During play the sheet is a pinned
  note on the Lore page (`app/story/lore.tsx`). The nine
  `CHARACTER_SHEET_PRESET_TEMPLATES` in `characterSheetTemplate.ts`, and the
  two lookups beside them, have no caller.
- `app/misc/party/` and `app/party/` — party mode: the protocol, the pure host
  state machine, the runtime and Tauri bridge, and the phone controller page.
- `src-tauri/`, `android/`, `ios/` — the native shells (`src-tauri/src/party_server.rs`
  is party mode's LAN server). `sync-worker/` — the
  sync backend. `scripts/` — `patchDiceBox.mjs` (postinstall) and
  `build-standalone.mjs`. `.github/workflows/build-apps.yml` — the manual
  native release build, never run.
- `tests/` — Vitest, 211 files and 3,427 tests (2026-10-25, after the
  starter welcomes; earlier 3,418 after feedback and the session-zero
  hand-back, 210 files and 3,410 after feedback;
  the counts were run). Earlier: 203 files and 3,228 tests (after the judge
  layer), 195 files and 3,032 tests (after Blood &
  Bone E1), 193 files and 3,000 tests (2026-10-24, after session
  zero detail; the test count is from the implementation log in
  `docs/session-zero-detail-design.md`, not a run), 189 files and 2,933 tests (2026-10-23, after session
  zero), largely against `app/misc/`.
  Deterministic tests seed `Math.random`; follow that for new dice and oracle
  tests.
- `docs/` — mixed freshness (see the top of this file). The `*.sql` files are
  one-off Supabase migrations from before the local-first pivot; there is no
  database any more.

## Conventions

- **Every screen's colours are the `ys-*` tokens**: `bg-ys-bg`,
  `bg-ys-surface`, `bg-ys-surface-2`, `text-ys-text`, `text-ys-muted`,
  `border-ys-border`, `text-ys-accent`, `bg-ys-accent` with
  `text-ys-on-accent`, and the meaning tokens `ys-danger`, `ys-success` and
  `ys-warning`. The `--ys-gradient` is for the home page, the Library, the
  Designer, the terms and privacy pages and the site header; the story screen
  stays flat. The tokens are set by the reading theme
  (`app/story/themeTokens.ts`: `THEME_PRESETS`, `themeTokens()`,
  `applyThemeVars()`; Ink is the default) and defined in
  `app/globals.css`, where the shared component classes also live: `ys-card`,
  `ys-input`, `ys-button` with `--primary`, `--ghost` or `--danger`, `ys-chip`,
  `ys-modal-backdrop` and `ys-modal`. Never `purple-*`, `blue-*` or another
  palette hue, `bg-white`/`text-white`, `dark:`, or a hex or `rgb(` in a
  class. Red, green and amber appear only as the meaning tokens. Fixed
  palettes stay literal: the player colours (`app/misc/multiplayer/palette.ts`),
  the dice (`app/misc/diceColors.ts`), the folder colours and the QR code's
  black and white. Every `.tsx` or `.ts` file under `app/` is either listed in
  `tests/themeTokensOnly.test.ts` or exempted there with its reason, so a new
  file must choose. The pre-paint bootstrap (`app/misc/themeBootstrap.ts`,
  rendered by `app/components/InlineScript.tsx` in the root layout) mirrors
  `themeTokens()`: change both. Prose sits in a typography `prose` container
  whose own grey beats an inherited colour, so `prettify` sets
  `color: var(--ys-text)` inline.
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
