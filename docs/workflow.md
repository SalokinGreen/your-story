# Claude Code: An Effective Workflow

The author's working guide, built around a plan → implement → verify loop.
Checked into this repo because remote sessions are ephemeral — anything
outside the repository is gone when the container is reclaimed, so this is
the only place it survives.

**§10 at the bottom is the part specific to this project**: how Your Story
maps onto the loop, and what the loop implies for the work in flight.
Everything above it is the general guide, carried over word for word (apart
from two project-specific examples) from Beat Them Right on 2026-10-21,
which had it from Acts of Gods by way of Universal Gladiators.

Sources: [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) ·
[Model configuration](https://code.claude.com/docs/en/model-config) ·
[Choosing a model and effort level](https://claude.com/blog/claude-model-and-effort-level-in-claude-code)

---

## 1. The one constraint everything follows from

Claude's context window holds the entire conversation — every message, every
file read, every command output. Performance degrades as it fills: Claude
starts forgetting earlier instructions and making more mistakes. A single
debugging session can burn tens of thousands of tokens.

Almost every practice below is downstream of this. **Context is the resource
you are managing.**

Run `/context` to see what's loaded. A [custom status line](https://code.claude.com/docs/en/statusline)
tracks it continuously.

---

## 2. The five-phase loop

### Phase 1 — Explore (plan mode)

Enter plan mode with `Shift+Tab` until the status bar shows `⏸ plan mode on`,
or launch with `claude --permission-mode plan`. Claude reads and answers
without making changes.

```
read /src/auth and understand how we handle sessions and login.
also look at how we manage environment variables for secrets.
```

**Use subagents for anything broad.** Exploration reads a lot of files, and
all of it lands in your main context. Subagents run in their own context
window and report back a summary:

```
Use subagents to investigate how our authentication system handles token
refresh, and whether we have any existing OAuth utilities I should reuse.
```

### Phase 2 — Plan (interview + spec file)

For anything non-trivial, have Claude interview you rather than guessing:

```
I want to build [brief description]. Interview me in detail using the
AskUserQuestion tool.

Ask about technical implementation, UI/UX, edge cases, concerns, and
tradeoffs. Don't ask obvious questions, dig into the hard parts I might
not have considered.

Keep interviewing until we've covered everything, then write a complete
spec to SPEC.md.
```

A good spec:

- names the files and interfaces involved
- states explicitly what is **out of scope**
- ends with an **end-to-end verification step** that proves the feature works

Time spent making the spec precise pays off more than time spent watching the
implementation. `Ctrl+G` opens the generated plan in your text editor so you
can edit it directly before approving.

**Write the plan to a file, not just the conversation.** This is what makes
the next phase cheap.

### Phase 3 — Plan the implementation (a second, different document)

**Added after the Discourse design pass, which is what showed the gap.** A
design document and an implementation plan are not the same artifact, and
collapsing them is how a good design arrives at the keyboard still needing
every real decision made.

The design document answers **what and why**: what a system is, which
mechanic serves which purpose, what the substrate already provides, what is
out of scope. (The example that showed the gap was the author's discourse
design in an earlier project: six thousand words about reasons, receptions and
misattribution that named not one file it would be written in.)

The implementation plan answers **which, in what order, and what breaks**:

- **Which files**, named. New ones and every existing one that changes.
- **Which signatures** — the actual type and method shapes, enough that
  writing them is transcription rather than invention.
- **What order**, as slices that each land, verify and could be shipped
  alone. Name the first slice and why it is first.
- **Which existing call sites move**, found by grep rather than by memory.
  This is where an unnoticed twenty-file blast radius surfaces, and it is
  much cheaper to find here.
- **What could break**, with the check that would catch it. For this repo:
  which slices touch the engine in `app/misc/` and therefore need a test
  baseline captured before editing and the `engine-review` agent after.
- **What is deliberately not built**, restated from the design in
  implementation terms — the seam left, not the intention.

Write it to a file, same as the design. Then Phase 4 reads *that* file.

The test for whether it is done: **could a session that has never seen the
planning conversation build this?** If a step still needs a judgement call
the plan does not make, that judgement is what the plan is missing.

### Phase 4 — Implement (fresh session)

Start a **new session** to execute. Clean context, focused entirely on
implementation, and the plan is a file it can read instead of 40k tokens of
planning conversation it has to carry.

```
implement the OAuth flow from PLAN.md. write tests for the callback
handler, run the test suite and fix any failures.
```

### Phase 5 — Verify (the phase most workflows skip)

> Give Claude a check it can run: tests, a build, a screenshot to compare.
> It's the difference between a session you watch and one you walk away from.

Claude stops when the work *looks* done. Without a runnable check, "looks
done" is the only signal available — and you become the verification loop, so
every mistake waits for you to notice it.

Four levels, in increasing order of setup cost:

| Level | Mechanism |
|---|---|
| In one prompt | Ask Claude to run the check and iterate in the same message |
| Across a session | Set the check as a [`/goal` condition](https://code.claude.com/docs/en/goal) — a separate evaluator re-checks after every turn |
| Deterministic gate | A [Stop hook](https://code.claude.com/docs/en/hooks) blocks the turn from ending until your script passes |
| Second opinion | A verification subagent — a fresh model tries to refute the result |

Then add an **adversarial review** before you call it done:

```
Use a subagent to review the rate limiter diff against PLAN.md. Check that
every requirement is implemented, the listed edge cases have tests, and
nothing outside the task's scope changed. Report gaps, not style preferences.
```

Or just run the bundled `/code-review` skill, which reviews the current diff
for bugs in a fresh subagent.

⚠️ **Caveat:** a reviewer prompted to find gaps will usually report some, even
when the work is sound — that is what it was asked to do. Chasing every
finding leads to over-engineering. Tell the reviewer to flag only gaps that
affect correctness or the stated requirements, and treat the rest as optional.

**Always ask for evidence, not assertions** — the test output, the command and
what it returned, a screenshot. Reviewing evidence is faster than re-running
the verification yourself.

### When to skip all of this

Plan mode adds overhead. Planning earns its keep when you're uncertain about
the approach, when the change touches multiple files, or when you're
unfamiliar with the code.

> If you could describe the diff in one sentence, skip the plan.

---

## 3. The two dials: model and effort

These are different knobs and they fix different failures.

**Model** = *how capable*. Which set of frozen weights handles the request.
**Effort** = *how thorough*. How many files it reads, how much it verifies,
how far it pushes a multi-step task before checking in with you.

### The diagnostic

When Claude gets something wrong, first check whether the context was the
problem — vague prompt, missing tools, thin CLAUDE.md. If the context was
fine, ask:

| Symptom | Fix |
|---|---|
| Had all the context, clearly tried, still wrong | **Bigger model** |
| Skipped a file, didn't run the tests, bailed on a refactor partway | **Higher effort** |

### Allocating models across the loop

The governing principle: **larger models handle ambiguity better; specific
instructions directing execution are a better recipe for smaller models.**

| Phase | Character of the work | Model |
|---|---|---|
| Explore / Plan | Ambiguous — architecture, unknowns, "what did we miss" | **Fable / Opus** |
| Plan the implementation | Semi-ambiguous — the *what* is settled, the blast radius is not | **Opus** |
| Implement | Specified — execute an approved plan | **Sonnet** |
| Debug a stuck problem | Ambiguous — root cause unknown | **Fable** |
| Mechanical edits, renames, questions about code in context | Routine | **Sonnet / Haiku** |

Phase 3 sits deliberately on the expensive side of that line. It is the last
point where a wrong call is cheap — finding a twenty-file blast radius here
costs a paragraph, and finding it in Phase 4 costs the implementation.

Claude Code ships `opusplan` as a built-in alias for exactly this shape: Opus
during plan mode, automatic switch to Sonnet for execution.

Fable is the most capable model in Claude Code, suited to tasks larger than a
single sitting — it sustains long autonomous sessions, investigates before
acting, and verifies its work more often than smaller models. Reach for it on
root-cause investigations, outage debugging, and architecture decisions.

**The tradeoff to weigh:** Fable costs the most per token and consumes the
most rate limit, so rationing it is reasonable. But if you ration it to one
phase, ration it to *planning* — a flawed plan costs you the entire
implementation downstream.

Working with Fable specifically:

- Describe the **outcome**, not the steps — let it plan the path
- Skip the verification reminders; it verifies its own work with less prompting
- Size up: give it work you'd normally break into pieces

### Effort levels

`low` · `medium` · `high` (default) · `xhigh` · `max`

Set with `/effort`, `--effort` at launch, `effortLevel` in settings, or
per-skill/subagent frontmatter. Guidance is to **use the model's default for
most tasks** and treat effort as a standing preference for your kind of work,
not a per-task decision. `max` can improve demanding tasks but shows
diminishing returns and is prone to overthinking — test before adopting.

For one-off depth without changing the session setting, put **`ultrathink`**
anywhere in your prompt. (Note: "think hard", "think more" etc. are *not*
recognized keywords — they pass through as ordinary text.)

`/effort ultracode` is a session-only Claude Code setting, not a model level:
`xhigh` reasoning plus dynamic workflow orchestration for substantive tasks.

---

## 4. Prompting: be specific

| Instead of | Write |
|---|---|
| "add tests for foo.py" | "write a test for foo.py covering the edge case where the user is logged out. avoid mocks." |
| "fix the login bug" | "users report login fails after session timeout. check the auth flow in src/auth/, especially token refresh. write a failing test that reproduces the issue, then fix it" |
| "add a calendar widget" | "look at how existing widgets are implemented on the home page. HotDogWidget.php is a good example. follow that pattern... build from scratch without libraries other than the ones already used" |
| "the build is failing" | "the build fails with this error: [paste]. fix it and verify the build succeeds. address the root cause, don't suppress the error" |

Vague prompts still have a place — `"what would you improve in this file?"`
surfaces things you wouldn't have thought to ask.

**Feeding in context:**

- `@path/to/file` — Claude reads it before responding
- Paste or drag images directly
- Give URLs for docs; allowlist frequent domains with `/permissions`
- `cat error.log | claude` to pipe data in

---

## 5. Environment setup

### CLAUDE.md

Run `/init` to generate a starter, then prune it. Loaded every session, so
only include what applies broadly.

| ✅ Include | ❌ Exclude |
|---|---|
| Bash commands Claude can't guess | Anything Claude can learn by reading the code |
| Style rules that differ from defaults | Standard language conventions |
| Test runners and testing instructions | Detailed API docs (link instead) |
| Branch naming, PR conventions | Info that changes frequently |
| Project-specific architectural decisions | File-by-file descriptions |
| Env quirks, required vars, gotchas | "Write clean code" |

The test for every line: *would removing this cause Claude to make mistakes?*
If not, cut it.

> Bloated CLAUDE.md files cause Claude to ignore your actual instructions.

**Debugging signals:** if Claude keeps violating a rule you wrote, the file is
probably too long and the rule is getting lost. If Claude asks questions the
file already answers, the phrasing is ambiguous. Treat it like code — review
it when things go wrong, prune regularly, check it into git.

### Skills vs. CLAUDE.md

CLAUDE.md loads every session. For domain knowledge or workflows only relevant
*sometimes*, use a skill — `.claude/skills/<name>/SKILL.md`. Claude loads them
on demand without bloating every conversation.

```markdown
---
name: fix-issue
description: Fix a GitHub issue
disable-model-invocation: true
---

Analyze and fix the GitHub issue: $ARGUMENTS.

1. Use `gh issue view` to get the issue details
2. Search the codebase for relevant files
3. Implement the fix
4. Write and run tests
5. Ensure lint and typecheck pass
6. Push and create a PR
```

`disable-model-invocation: true` for side-effecting workflows you want to
trigger manually (`/fix-issue 1234`).

### Hooks

CLAUDE.md instructions are advisory. Hooks are deterministic. Use them for
things that must happen **every time, with zero exceptions** — lint after every
edit, block writes to `migrations/`. Claude can write them for you; `/hooks`
browses what's configured.

### Custom subagents

`.claude/agents/*.md`, each with its own context, tool set, and model:

```markdown
---
name: security-reviewer
description: Reviews code for security vulnerabilities
tools: Read, Grep, Glob, Bash
model: opus
---

You are a senior security engineer. Review code for injection
vulnerabilities, authz flaws, secrets in code, insecure data handling.
Provide specific line references and suggested fixes.
```

This is where model allocation gets granular — pin a cheap model to a
read-only explorer agent, an expensive one to a reviewer.

### Other setup

- **CLI tools** — install `gh`, `aws`, `gcloud`. Most context-efficient way to
  hit external services. Claude also learns unknown ones:
  `Use 'foo-cli --help' to learn foo, then use it to solve A, B, C.`
- **MCP servers** — `claude mcp add` for Notion, Figma, your database, issue tracker
- **Permissions** — `/permissions` to allowlist trusted tools, `/sandbox` for OS-level isolation
- **Plugins** — `/plugin` to browse. If you use a typed language, a code
  intelligence plugin gives Claude precise symbol navigation and automatic
  error detection after edits.

---

## 6. Session management

| Action | How |
|---|---|
| Stop mid-action, keep context | `Esc` |
| Rewind conversation and/or code | `Esc Esc` or `/rewind` |
| Revert changes | "undo that" |
| Reset context between tasks | `/clear` |
| Targeted compaction | `/compact Focus on the API changes` |
| Side question that never enters history | `/btw` |
| Name a session | `/rename` |
| Resume | `claude --continue` / `claude --resume` |

**The rule that matters most:** if you've corrected Claude more than twice on
the same issue, the context is now polluted with failed approaches. `/clear`
and restart with a better prompt that incorporates what you learned. A clean
session with a good prompt almost always beats a long session with accumulated
corrections.

⚠️ Checkpoints only track changes made through Claude's file editing tools.
Changes made via Bash or external processes aren't captured. **Not a
replacement for git.**

---

## 7. Scaling up

### Parallel sessions

- [Worktrees](https://code.claude.com/docs/en/worktrees) — isolated git checkouts, edits don't collide
- Desktop app — manage multiple local sessions visually, each in its own worktree
- [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web) — cloud sessions
- [Agent teams](https://code.claude.com/docs/en/agent-teams) — automated coordination with shared tasks and a team lead

**Writer/Reviewer pattern:** Session A implements. Session B reviews with fresh
context. Feed B's output back to A. A fresh context improves code review, since
Claude won't be biased toward code it just wrote. Same trick works for
tests-first: one session writes tests, another writes code to pass them.

### Non-interactive mode

```bash
claude -p "Explain what this project does"
claude -p "List all API endpoints" --output-format json
claude -p "Analyze this log file" --output-format stream-json --verbose
```

### Fan out across files

```bash
# 1. have Claude write files.txt
# 2. loop
for file in $(cat files.txt); do
  claude -p "Migrate $file from React to Vue. Return OK or FAIL." \
    --allowedTools "Edit,Bash(git commit *)"
done
```

Refine the prompt against the first 2–3 files, then run at scale.
`--allowedTools` matters when running unattended.

---

## 8. Failure patterns

| Pattern | Fix |
|---|---|
| **Kitchen sink session** — one task, then an unrelated one, then back | `/clear` between unrelated tasks |
| **Correcting over and over** — context full of failed attempts | After two failures, `/clear` + better prompt |
| **Over-specified CLAUDE.md** — important rules lost in noise | Prune ruthlessly; convert must-happens to hooks |
| **Trust-then-verify gap** — plausible code that misses edge cases | Always provide a runnable check. If you can't verify it, don't ship it |
| **Infinite exploration** — "investigate X" reads 200 files | Scope narrowly, or delegate to a subagent |

---

## 9. Develop your own intuition

These are starting points, not rules. Sometimes you *should* let context
accumulate because you're deep in one problem and the history is valuable.
Sometimes skip planning because the task is exploratory. Sometimes a vague
prompt is exactly right because you want to see how Claude frames the problem
before you constrain it.

When Claude produces great output, notice what you did — the prompt structure,
the context you gave, the mode you were in. When it struggles, ask why: context
too noisy, prompt too vague, or task too big for one pass?

---

## 10. What this means for Your Story

The section above is general. This section maps it onto *this* repository.
Unlike Beat Them Right when the guide arrived there, Your Story is not new:
it has a large, working codebase (Next.js 16 + React 19 + TypeScript, an
LLM game master and a deterministic engine in `app/misc/`) and a test suite
of about 1,600 Vitest tests. What it lacked was the loop.

### What exists today

- **The checks.** `npx vitest run`, `npx tsc --noEmit`, `npx eslint .`,
  `npm run build`, `node scripts/build-standalone.mjs` (the static export
  the native apps package), and `npx tauri build` on this machine. The
  `verify` skill has the commands and how to read them.
- **The native shells.** `src-tauri/` (desktop), `android/` and `ios/`
  (Capacitor). The native apps are the product (decision 1 in
  [`decisions.md`](decisions.md)); the web build is a testing vehicle.
- **The audit.** [`status-report-2026-10-20.md`](status-report-2026-10-20.md)
  is the state of the project as of 2026-10-20, with dated update notes
  where something it lists has since been fixed.
- **The tooling.** `.claude/` — the agents (`code-explorer`,
  `engine-review`, `fable-escalation`), the skills (`verify`,
  `empty-playtest`), the SessionStart hook and the permissions, plus
  `.claude/launch.json` for the browser preview.
- **This file, `CLAUDE.md`, [`decisions.md`](decisions.md) and
  [`pending_tests.md`](pending_tests.md).**

### What does not exist yet

- **No CI on pull requests.** The only checks GitHub shows are Vercel's
  preview deploys, which prove a deploy and nothing else. Every PR so far
  was verified by the session that wrote it. A `ci.yml` running the suite
  and a lint ratchet is the audit's next recommended step (§16, item 2).
- **No headless check of the GM against a real model.** The suite tests
  the engine and the prompt builders, never what a model actually does with
  them. Any run against a live provider spends the author's own keys, so it
  waits for the author's go.
- **No Android or iOS build has ever been run.** This machine has no
  Android SDK and no Mac; `build-apps.yml` has never been triggered.

### The rules that come over unchanged

**Phase 5 (verify) is not optional and not negotiable.** The engine is
deterministic code under a seeded `Math.random` in tests; keep it that way,
and keep the suite green on every merge.

**Never claim something was tested when it was compiled.** See `CLAUDE.md`.
A passing `next build` says nothing about whether the native app can reach
a provider.

**Plans are published, not just written.** The markdown in `docs/` is the
source of truth; the artifact is the reading copy, and the author reads
that one.

**Broad exploration is delegated, not done inline** — to the
`code-explorer` agent or `Explore`, without asking.

### The rule added for this repository

**The native build is the one that counts.** A change that only works on the
web build (a raw `fetch("/api/...")`, a link built from
`window.location.origin`, a host missing from the Tauri allowlist) is broken
for the product, even when every test passes. Verify against the standalone
build, and against `tauri build` when native configuration moves.
