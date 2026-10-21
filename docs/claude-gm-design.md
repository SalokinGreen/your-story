# Claude as the game master — design

**Status:** approved to build, 2026-10-21 (decision 17).
Decisions 10–14 in [`decisions.md`](decisions.md). The implementation plan is
[`claude-gm-implementation-plan.md`](claude-gm-implementation-plan.md).

## 1. What this is

Two ways to play Your Story with Claude:

- **Route A — Claude through OpenRouter.** Claude Haiku 5.5, Sonnet 5.5 and
  Opus 5.5 become ordinary catalog models, billed per token to the player's
  existing OpenRouter key. Works on every platform.
- **Route B — the player's own Claude subscription, on the desktop app.** The
  desktop app drives the `claude` CLI (Claude Code) that the player installed
  and signed in to themselves. The GM rounds and the narration then run on
  their Pro/Max plan, not on a per-token bill. Desktop only.

There is no Anthropic API key route for now (decision 10).

## 2. Out of scope

- An Anthropic API key provider (decision 10).
- The subscription on the phone, or relaying from the phone through the PC.
  A phone cannot run the CLI, and a relay would route requests through
  subscription credentials, which Anthropic's terms forbid (decision 10).
- Claude Code running the GM loop and calling the app's tools over MCP
  (decision 11).
- Side agents on the subscription by default (decision 12); a player can
  still point one at a subscription model in Settings.
- Distributing the subscription route to other people. See §5.4.

## 3. Route A — Claude through OpenRouter

### 3.1 The models

| catalog name | OpenRouter id | $/M in | $/M out | cache read $/M |
|---|---|---|---|---|
| Claude Haiku 5.5 | `anthropic/claude-haiku-5.5` | 0.10 | 0.50 | 0.01 |
| Claude Sonnet 5.5 | `anthropic/claude-sonnet-5.5` | 2.00 | 10.00 | 0.10 |
| Claude Opus 5.5 | `anthropic/claude-opus-5.5` | 4.00 | 20.00 | 0.20 |

All three have a 1M context window and 128k output, and support tool calling
and reasoning effort. Prices are from OpenRouter's model list on 2026-10-21.
Claude Fable 5.1 (`anthropic/claude-fable-5.1`, $10 / $50) is left out
(decision 15).

### 3.2 What current Claude models reject, and what the app sends today

Claude's 5.5 generation rejects four things this app sends, so a request
would fail with a 400 unless each gets a Claude branch:

| the app sends | where | Claude 5.5 | the branch |
|---|---|---|---|
| `tool_choice: "required"` | the roll gate and the plan gate (`generation.ts`) | forced tool use returns 400 | send `auto`; the gate already pushes a user message saying a tool call is required |
| temperature, top_p, penalties, min_p, top_k | the story stage's sampling settings | non-default sampling returns 400; OpenRouter lists no sampling parameters for these models | omit them |
| a trailing assistant prefill | the GM stage on effort-`none` tiers, the choices stage | prefill returns 400 | strip it, as already done for four other providers when tools are present |
| reasoning effort `none` | the light tiers (Mistral-style config) | thinking cannot be disabled | map `none` to `low` |

One more branch is keyed on the provider, not the model: a Gemini quirk that
attaches `thought_signature` to tool calls whenever an OpenRouter reply
carries an encrypted reasoning detail. Claude's thinking signatures would hit
it. It has to check for a `google/` model instead.

### 3.3 Thinking blocks and caching

- **Thinking replay.** Within a GM turn the app already replays the latest
  assistant part's `reasoning_details` (signatures included) and drops older
  ones. That matches what Claude needs inside a tool loop: blocks returned
  unchanged on the same model. Claude 5.5 also checks that replayed blocks
  sit in unedited history, and the app does edit history (Observer resets,
  budget trimming, compaction). Because only the newest part's blocks are
  replayed, this should hold, but it is the first thing to watch in a live
  run.
- **Prompt caching.** The GM prompt is long and stable from round to round,
  and the app keeps its prefix byte-identical on purpose. Claude only caches
  where the request marks a `cache_control` breakpoint. Without one, every
  round pays full input price. Marking the stable prefix should cut a GM
  round on Sonnet from about $0.07 (36k tokens at $2/M) to well under a cent
  after the first round. These are estimates to verify with a live key.

## 4. Route B — the subscription through the `claude` CLI

### 4.1 Shape

The app keeps its own GM loop (decision 11). Each round it would normally
send to an HTTP provider, it instead runs the CLI once. The CLI's built-in
tools are switched off, and a JSON schema makes it answer in this shape:

```json
{ "narration": "…", "tool_calls": [ { "name": "formula_roll", "arguments": { … } } ] }
```

The app executes those calls exactly as it executes any provider's tool calls,
appends the results and runs the next round. The engine stays in charge:
dice, verdicts, gates, the round cap and tier switching are unchanged.

The narration stage runs the CLI in streaming mode and shows text live as it
arrives.

### 4.2 Measured on the author's machine (decision 14, 2026-10-21)

Four test calls, CLI 2.1.299/2.1.306, Windows 11, Max plan, all `subtype:
success`:

| test | result |
|---|---|
| plain JSON, Haiku | "OK"; 4.8 s wall, 1.3 s model — about **3 s per launch** |
| structured output with tools off, Haiku | correct narration and a `formula_roll` call for `1d20+3`; 8.0 s wall, 3.2 s model |
| forced tool call (`minItems: 1`) and a name list, Sonnet | a sensible roll on a prompt that needed none; only listed names used; 8.3 s wall, 4.2 s model |
| streaming narration, Haiku | 32 live text deltas; 5.0 s wall |

The start-up event confirmed `apiKeySource: none` (the subscription), no
tools, no MCP servers, no skills — **but the author's plugins still loaded**
(one synced plugin and three built-in ones). §4.4 covers that.

### 4.3 Which calls use it, and how models are picked

- **GM rounds and narration** run on the subscription (decision 12). The side
  agents stay on their current models; any of them can be pointed at a
  subscription model per layer in Settings.
- **Three new catalog models**, "Claude Opus (subscription)", "Claude Sonnet
  (subscription)", "Claude Haiku (subscription)", pinned to
  `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5`. They appear
  in the existing pickers on the desktop app when the CLI is installed and
  signed in, and are assigned to the four reasoning tiers and narration like
  any other model (decision 13).
- **Effort** maps from the tier's setting: `none` → `low` (thinking cannot be
  turned off), `low` → `low`, `normal` → `medium`, `high` → `high`,
  `xhigh` → `xhigh`.
- **Cost** is recorded as "on your subscription", $0, in the turn cost panel.
  The CLI's own dollar figure is notional for subscribers.

### 4.4 How the CLI is launched

A narrow Rust command in the desktop app launches the CLI. The webview never
gets a general "run a program" capability. The command builds the argument
list itself from a typed request, so the webview can choose only an allowed
model, an effort level, a mode (structured or streaming), the schema, the
system prompt and the prompt text.

Every launch:

- runs the unmodified `claude` binary found on the player's PATH;
- starts from a **clean environment**: no `ANTHROPIC_*` or `CLAUDE_*`
  variables. An `ANTHROPIC_API_KEY` in the environment would silently bill the
  API instead of the subscription, and a variable like `CLAUDE_CODE_SIMPLE`
  (inherited when launched from inside Claude Code) would ignore the sign-in;
- runs in an **empty app-owned folder**, with CLAUDE.md loading off, all
  built-in tools off, no MCP servers, no slash commands, no session saved,
  and **safe mode** so the player's plugins and hooks stay out of the game;
- passes the system prompt through a file and the conversation through stdin,
  so neither runs into Windows' command-line length limit;
- can be cancelled: Stop kills the process.

The app checks `claude auth status` to show, in Settings, one of: signed in
(with the plan), not signed in, or CLI not found. A short explanation sits
next to it: run `claude`, then `/login`, in a terminal. Sign-in always
happens in Anthropic's own flow; the app never reads or stores credentials.

### 4.5 Failure and the phone

- **Not signed in, CLI missing, or a usage limit hit** ("session limit",
  "weekly limit"): the turn stops with a clear message saying which. It does
  not quietly switch to a paid provider, because that would spend money the
  player did not choose to spend.
- **Synced settings on the phone.** Tier and narration choices sync between
  devices, so a desktop tier set to a subscription model would reach the
  phone, which cannot run the CLI. On a device without the CLI, a
  subscription model falls back to that slot's default model, with a notice
  in Settings (decision 16).

### 4.6 Latency

About 3 s of launch overhead per CLI call, plus the model's own time. A turn
with three GM rounds and a narration pass is four launches: roughly 12 s of
overhead on top of 15–25 s of model time. A long-lived CLI process fed over
stdin would remove most of the overhead, but its wire format is not
documented, so it is left for later (§6).

### 4.7 Caching and usage limits

Each launch re-sends the whole conversation (stateless, like every other
provider here), which keeps Observer resets and budget trimming correct. The
CLI caches prompts automatically; with the system prompt and the stable
prefix identical across rounds, later rounds should read from the cache. The
tests saw only cache writes, because every prompt differed. Heavy play still
draws on the plan's limits: Anthropic's terms describe Pro/Max limits as
assuming "ordinary, individual usage".

## 5. Terms

### 5.1 What this route does

Anthropic's Claude Code legal page
(https://code.claude.com/docs/en/legal-and-compliance) says sign-in with a
subscription is for Claude Code and Anthropic's own apps; that third-party
developers may not offer Claude.ai login, route requests through Pro/Max
credentials on behalf of their users, or collect, store or relay Claude.ai
credentials or session tokens; and that this "does not … prevent an end user
from signing in to the unmodified Claude Code binary with their own Claude
subscription". It also says Anthropic may enforce without notice.

This design stays on the permitted side: the player installs and signs in to
the unmodified CLI themselves; the app only launches it; the app never sees,
reads or stores a credential; nothing is relayed; it is the player's own use
on their own machine.

### 5.2 The guardrails, as rules for the build

- Never read `~/.claude/.credentials.json`, the keychain, or any token.
- Never modify, bundle or patch the `claude` binary.
- Never relay a request from another device. That includes **online
  multiplayer**: while an online session (host or guest) is active,
  subscription models are not used and every slot runs its default (decision
  29). Couch co-op on one device and **party mode** (friends' phones as
  controllers for the host's own desktop game) are the player's own use on
  their own machine, and stay allowed (decision 30).
- Never use the name "Claude Code" as a feature name; the models are
  "Claude … (subscription)".

### 5.3 Usage

The player's plan limits apply. The app shows the CLI's own error text when a
limit is reached.

### 5.4 If the app is ever distributed

Each player would install and sign in to their own CLI, and Anthropic's
Commercial Terms conditions for running Claude Code in a product would apply.
This design does not ship anything that changes for that case, but it should
be re-read before any public release.

## 6. Deliberately not built now

- A long-lived CLI process per session (would remove most launch overhead;
  the stdin wire format is undocumented).
- Streaming the GM rounds' own text (structured output arrives at the end of
  each round).
- The Game Designer on the subscription (it uses tool calling too, so the
  same structured path could serve it; a later slice).
- Showing the plan's remaining usage (the CLI emits a `rate_limit_event`;
  reading it is a later nicety).

## 7. Answered questions

1. **Claude Fable 5.1 through OpenRouter** — left out (decision 15).
2. **The phone and synced subscription models** — fall back to the slot's
   default model with a notice (decision 16).

## 8. Addendum — GLM through Z.ai and OpenRouter (decision 18)

The author asked for Z.ai's GLM Coding Plan. Z.ai's FAQ limits the plan to
"officially supported tools and products" and says subscribers "shall not use
the subscription benefits in any unsupported tools or scenarios"; a game
master is neither, including through the `claude` CLI. So, instead:

- **Z.ai as a direct provider.** The player's own Z.ai API key on the
  **general** pay-as-you-go endpoint, `https://api.z.ai/api/paas/v4` — never
  the coding endpoints (`/api/coding/paas/v4`, `/api/anthropic`). Models:
  GLM-5.3 (`glm-5.3`, $1.40 / $4.40 per M, cached input $0.26) and
  GLM-5.3-Flash ($0.15 / $0.50, cached $0.03); 1M context, 128k output, tool
  calling. Thinking cannot be disabled; `reasoning_effort` is `low`, `high`
  or `max`. Works on every platform.
- **GLM 5.3 through OpenRouter** — `z-ai/glm-5.3` and `z-ai/glm-5.3-flash`, next
  to the existing GLM 5.2, for a device with no Z.ai key.

The guardrail, as a rule for the build: the Z.ai provider calls only the
general endpoint, and the desktop allowlist admits only `api.z.ai/api/paas/*`,
so a Coding Plan key cannot be used through the app by accident.
