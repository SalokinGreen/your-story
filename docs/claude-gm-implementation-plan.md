# Claude as the game master — implementation plan

**Status:** approved to build, 2026-10-21 (decision 17).
Design: [`claude-gm-design.md`](claude-gm-design.md). Decisions 10–14 in
[`decisions.md`](decisions.md). File references are from a code map of
master at `772c608`; line numbers are approximate (`~`) and must be
re-checked before editing.

## 0. Shape of the work

Two pull requests, **Route A first**:

1. **PR A — Claude through OpenRouter** (slices A1–A3). Small; touches
   `ai_prices.ts` and `providerCall.ts`.
2. **PR B — the subscription through the CLI** (slices B0–B5). Larger; adds a
   Rust command, one new TypeScript module and a branch in `providerFetch`.

They share `ai_prices.ts` and the `Provider` type, so they go in order rather
than in parallel. **Two other sessions are open on nearby code**: "Make Stop
cancel AI calls in the native apps" (`providerFetch.ts`, `providerCall.ts`
signal plumbing) and "Fix side agents falling back to DeepSeek V4 Flash"
(`generation.ts:~945`). Start PR B after the first one merges; its abort
plumbing is what B2 builds on.

The key choice that keeps this small: **the CLI route is intercepted inside
`providerFetch`**. `providerFetch` already returns either the route's
response or an in-process stand-in. The CLI branch returns the same frames
for `/api/generate-stream` and the same JSON for `/api/generate`, so
`generation.ts`, the GM loop, the gates, `callSideModel` and the Designer need
no changes.

## 1. Route A — Claude through OpenRouter

### A1. Catalog entries

**File:** `app/misc/ai_prices.ts` (`AI_MODELS`, ~`:1-757`).

Add three entries, fields as in `AIModelConfig` (~`:973-994`):

| key | `model` | `provider` | `maxTokens` | `maxOutputTokens` | `inputPrice` | `outputPrice` | `supportsToolCalling` |
|---|---|---|---|---|---|---|---|
| `"Claude Haiku 5.5"` | `anthropic/claude-haiku-5.5` | `openrouter` | 1000000 | 128000 | 0.10 | 0.50 | true |
| `"Claude Sonnet 5.5"` | `anthropic/claude-sonnet-5.5` | `openrouter` | 1000000 | 128000 | 2.00 | 10.00 | true |
| `"Claude Opus 5.5"` | `anthropic/claude-opus-5.5` | `openrouter` | 1000000 | 128000 | 4.00 | 20.00 | true |

Fill `strengths`, `weaknesses` and `description` in the style of the
neighbouring entries. Fable 5.1 is left out (decision 15).

**Check:** `tests/aiStaged.gmStageBudget.test.ts` iterates every catalog key
and must still pass, so each new entry has to give a positive history
budget.

### A2. The Claude branch in `providerCall.ts`

Add one helper and use it at four existing quirk sites:

```ts
/** OpenRouter routes this model to Anthropic's Claude (anthropic/…). */
function isAnthropicViaOpenRouter(config: AIModelConfig): boolean
```

| site | today | for Claude |
|---|---|---|
| `tool_choice` (~`:565-570`, ~`:770-775`) | `"required"` when asked | `"auto"` (the gates' own user message carries the instruction) |
| sampling (~`:740-768`) | temperature, top_p, penalties, min_p, top_k, repetition_penalty | omit all of them |
| trailing prefill (~`:395-406`) | stripped for deepseek/deepinfra/mistral/google with tools | also strip for Claude, with and without tools |
| `applyReasoningEffort` OpenRouter branch (~`:263-285`) | `none` → `reasoning: {effort: "none"}` | `none` → `low` |

And fix the Gemini quirk (~`:441-466`): attach
`extra_content.google.thought_signature` only when the model id starts with
`google/`, not for every OpenRouter model.

**Tests:** new `tests/providerCall.anthropic.test.ts`, in the style of
`tests/providerCall.reasoning.test.ts` (stub `fetch`, capture the body).
For an `anthropic/…` model it asserts: no sampling fields, `tool_choice:
"auto"` when `toolChoice: "required"` was asked, no trailing assistant
message, effort `none` sent as `low`, and no `thought_signature` attached.
It also asserts that a `google/…` model still gets the signature. The
existing reasoning tests must stay green.

### A3. Prompt caching for Claude via OpenRouter

The GM prompt's stable prefix (system message and the state message) is
rebuilt only on the first round (`generation.ts:~2223-2235`). For Claude
models, convert those messages' string `content` into a content-part array
with `cache_control: {type: "ephemeral"}` on the last part of the stable
prefix (one or two breakpoints at most, so rounds never vary inside the
cached part).

**File:** `providerCall.ts`, in the OpenRouter message builder. **Test:**
assert the breakpoint lands on the same message in rounds 1 and 2 of a scripted
turn. A live check (the cached-token count in the usage that comes back) needs
the author's key: add it to `pending_tests.md` unless the author says go.

**PR A done when:** suite and `tsc` pass, the new tests fail on the old
code, `engine-review` has reviewed the diff, and a PR is open. If the author
says go, one played turn on Claude Sonnet 5.5 with their OpenRouter key.

## 2. Route B — the subscription through the CLI

### B0. Two checks before building (needs the author's go: one or two Haiku calls)

1. `--safe-mode` keeps the subscription sign-in (`apiKeySource: none`) and
   leaves the start-up event's `plugins` list free of the author's plugins.
   If it breaks the sign-in, fall back to `--setting-sources` plus
   `--disable-slash-commands`, check again, and record what the plugins
   still contribute.
2. How Rust resolves the binary on Windows: `claude` found through the
   player's PATH (on this machine it is `C:\Users\Nikolas\.local\bin\claude`)
   with `.exe` and `.cmd` both tried.

Record both results in a dated section at the end of this file.

### B1. The Rust command

**Files:**
- `src-tauri/Cargo.toml` — add `tokio` (features `process`, `io-util`,
  `sync`) and `which`.
- `src-tauri/src/claude_cli.rs` — new.
- `src-tauri/src/lib.rs` — register the commands and the managed state.
- `src-tauri/build.rs` — an app manifest naming the three commands, so they
  need an explicit permission.
- `src-tauri/capabilities/default.json` — grant that permission to window
  `main` only.

**Signatures:**

```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliRequest {
    pub request_id: String,          // the app's id, used to cancel
    pub model: CliModel,             // enum: Opus | Sonnet | Haiku → "claude-opus-5-5" | …
    pub effort: CliEffort,           // enum: Low | Medium | High | Xhigh
    pub mode: CliMode,               // enum: Structured { schema: String } | Stream
    pub system_prompt: String,       // written to a temp file, passed with --system-prompt-file
    pub prompt: String,              // written to the child's stdin
}

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CliEvent {
    Line { json: String },           // one stdout line (NDJSON or the final JSON)
    Exit { code: Option<i32>, stderr_tail: String },
}

#[tauri::command] async fn claude_cli_status() -> Result<CliStatus, String>;   // runs `claude auth status` and `--version`
#[tauri::command] async fn claude_cli_run(req: CliRequest, on_event: tauri::ipc::Channel<CliEvent>,
                                           state: tauri::State<'_, CliProcesses>) -> Result<(), String>;
#[tauri::command] async fn claude_cli_cancel(request_id: String, state: tauri::State<'_, CliProcesses>) -> Result<(), String>;
```

`CliStatus` = `{ installed: bool, version: Option<String>, logged_in: bool,
auth_method: Option<String>, subscription_type: Option<String> }`. Parse
`claude auth status`'s JSON, and never return the e-mail address.

**The argument list is built in Rust**, never taken from the webview:

```
-p --output-format json|stream-json [--verbose --include-partial-messages]
--tools "" --strict-mcp-config --disable-slash-commands --no-session-persistence
--safe-mode (per B0) --model <pinned id> --effort <level>
--system-prompt-file <temp> [--json-schema <schema>]
```

**The environment:** `env_clear()`, then copy only the OS variables Windows
needs (`PATH`, `SYSTEMROOT`, `WINDIR`, `TEMP`, `TMP`, `USERPROFILE`,
`HOMEDRIVE`, `HOMEPATH`, `APPDATA`, `LOCALAPPDATA`, `PROGRAMDATA`,
`PROGRAMFILES`, `COMSPEC`, `PATHEXT`, `USERNAME`; and `HOME` on macOS/Linux),
and set `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`. No `ANTHROPIC_*` or `CLAUDE_*`
variable ever reaches the child. **The working directory** is an empty
folder under the app's data directory, created on first use.

**Processes:** `CliProcesses` is a `Mutex<HashMap<String, Child>>`. Spawn with
`kill_on_drop(true)`; stream stdout line by line into the channel; on exit,
send `Exit` with the last ~2 KB of stderr; remove the entry. `cancel` kills
the child. Validate the schema length (it must fit the command line; the
round schema is ~1.5 KB, see B2).

**Tests:** `cargo test` for the argument and environment builder: every
required flag is present; no environment key starts with `ANTHROPIC` or
`CLAUDE` except `CLAUDE_CODE_DISABLE_CLAUDE_MDS`; models map to the pinned
ids.

### B2. The TypeScript bridge

**File:** `app/misc/claudeCli.ts` — new.

```ts
export type ClaudeCliModelKey =
  "Claude Opus (subscription)" | "Claude Sonnet (subscription)" | "Claude Haiku (subscription)";

export function isClaudeCliModel(model: string): model is ClaudeCliModelKey;
export function isClaudeCliAvailablePlatform(): boolean;          // isTauri()
export async function getClaudeCliStatus(force?: boolean): Promise<ClaudeCliStatus>;  // cached ~60 s

/** Render a GM-stage request into the CLI's system prompt and stdin. Deterministic:
 *  the same messages always render byte-for-byte the same, and a later round only appends. */
export function renderCliPrompt(messages: ChatMessage[], tools?: ToolDefinition[]):
  { systemPrompt: string; prompt: string };

/** {narration, tool_calls[]} with the round's tool names as an enum; minItems 1 when forced. */
export function buildRoundSchema(toolNames: string[], forced: boolean): string;

export function mapEffort(effort: ReasoningEffort | undefined): "low" | "medium" | "high" | "xhigh";

/** The providerFetch branch: same Response shapes as the API routes. */
export async function claudeCliFetch(path: "/api/generate" | "/api/generate-stream",
  body: GenerateRequestBody, signal?: AbortSignal): Promise<Response>;
```

**Rendering rules:**
- `systemPrompt` = the request's system message, then a fixed "Tools" section
  (each tool's name, description and parameter JSON Schema, in whitelist
  order), then a fixed response-protocol paragraph.
- `prompt` = the remaining messages as labelled blocks: `[Player]`,
  `[Engine state]`, `[You, earlier this turn]` (with that round's tool calls
  as JSON), and `[Engine — tool results]` (each result under its call id).
- Tool argument schemas are **not** put in `--json-schema` (Windows'
  ~32k-character command-line limit). The schema checks only the shape and
  the tool names. The executors already validate arguments and return errors
  the model sees, the same path as `argsTruncated` (`gmExecutor.ts:~929-954`).

**`claudeCliFetch`:**
- **`/api/generate-stream` with `tools`** (a GM round): structured mode. On
  the final `result` line, emit `{type:"content", content: narration}`, then
  `{type:"tool_calls", toolCalls}` (ids `cli_<n>`, `arguments` already
  parsed) if there are any, then `{type:"done", meta}`. Use the same SSE frame
  encoding as `generateStream` (`providerCall.ts:~697-1008`), so
  `parseSSEStream` (`generation.ts:~506-579`) reads them unchanged.
- **`/api/generate-stream` without `tools`** (narration, choices): stream
  mode. Emit each `text_delta` as `content`. The CLI has no stop sequences,
  so cut the text at the first of `body.stop` and stop the process.
- **`/api/generate`** (side calls when a player picks a subscription model;
  the Designer): structured mode if `tools` is set, otherwise JSON mode.
  Return `GenerateSuccess` JSON (`providerCall.ts:~99-116`).
- `meta` = `{model: <pinned id>, modelName: body.model, provider:
  "claude-cli", usage: {promptTokens, completionTokens, totalTokens},
  estimatedCost: 0}`.
- **Errors:** an `is_error` result or a non-zero exit becomes `{type:"error",
  error, code}` with codes `CLI_NOT_FOUND`, `CLI_NOT_SIGNED_IN`,
  `CLI_USAGE_LIMIT` (matching "session limit" or "weekly limit") and
  `CLI_FAILED`. A `structured_output` that is missing or fails the shape
  check is `CLI_FAILED`; there is no silent fallback.
- **Abort:** on `signal` abort, call `claude_cli_cancel` and reject with an
  `AbortError`.

### B3. Wiring it in

| file | change |
|---|---|
| `app/misc/providerFetch.ts` (~`:28-58`) | first line: `if (isClaudeCliAvailablePlatform() && isClaudeCliModel(body.model)) return claudeCliFetch(path, body, signal)`. It must come **before** the `isStandalone()` check, because `tauri dev` is not standalone. |
| `app/misc/providerCall.ts` | `Provider` union (~`:32`) gains `"claude-cli"`; `PROVIDER_NAMES` (~`:304`) gains `"Claude (subscription)"`; `getApiKey` (~`:290`) returns no key for it; `resolveProviderAndKey` (~`:513-530`) throws a clear error if a `claude-cli` model ever reaches it (it should not: B3's providerFetch line catches it first). |
| `app/misc/ai_prices.ts` | three `claude-cli` entries (`model` = pinned id, 1M / 128k, prices 0, tool calling true); `PROVIDER_KEY_FIELD` (~`:891-900`) becomes `Partial` or gains a "no key" sentinel; `getAvailableModels` offers `claude-cli` models only when `isClaudeCliAvailablePlatform()` and the cached status is signed in. |
| `app/misc/reasoningTiers.ts` (~`:107-184`) | when a tier or narration override names a `claude-cli` model on a device without the CLI, resolve to that slot's default model and record a notice (design §4.5, decision 16). |
| `app/components/AIConfigTab.tsx` (~`:35-42`, ~`:432`) | the "No key" badge for `claude-cli` becomes the CLI status ("Signed in (Max)" / "Not signed in" / "CLI not found"). |
| `app/creator/page.tsx` (~`:71-86`), `app/creator/useDesignerSession.ts` (~`:251-262`) | handle the new provider in their provider switches (no key needed). |

### B4. Settings and cost

- **`AIConfigTab.tsx`:** a "Claude subscription" row with the status, a
  Refresh button, and the instruction: "Open a terminal, run `claude`, then
  `/login`." No sign-in button, no credential field.
- **`turnCost.ts` / `TurnCostPanel.tsx`:** a `claude-cli` call is priced at
  $0 and labelled "on your subscription", not "unpriced".

### B5. Docs

- `CLAUDE.md` Architecture: the provider list, the CLI route and its
  guardrails (design §5.2) as rules.
- `docs/pending_tests.md`: the live checks below.
- `docs/decisions.md`: any new decisions made while building.
- This file: a dated "Decisions made during implementation" section.

## 3. Tests for PR B

| test | what it proves |
|---|---|
| `tests/claudeCli.render.test.ts` | rendering is deterministic, and round 2's system prompt and prompt start with round 1's byte for byte; the schema has the enum and `minItems` only when forced; the effort mapping; cutting at stop sequences |
| `tests/claudeCli.fetch.test.ts` (mock `@tauri-apps/api/core` `invoke` and `Channel`) | a structured result becomes `content` + `tool_calls` + `done` frames that `parseSSEStream` reads; stream mode emits deltas; each error code; abort calls `claude_cli_cancel` and rejects with `AbortError` |
| `tests/generation.claudeCli.test.ts` | a full turn on a mocked CLI: a round with a roll, then narration; the roll gate firing makes the next round's schema forced (`minItems: 1`); a usage-limit error ends the turn with that message and no paid fallback |
| `tests/reasoningTiers.cliFallback.test.ts` | a synced subscription tier on a non-desktop device resolves to the slot's default model |
| existing | `noRawApiFetch` (the new module uses `invoke`, not `fetch("/api/…")`); `generation.m2RollGate`, `generation.planGate`, `generation.sideCallKeys`, `aiStaged.gmStageBudget`, `turnCost` stay green |

## 4. What could break, and the check that catches it

| risk | check |
|---|---|
| `--safe-mode` drops the subscription sign-in | B0 check 1, before any code |
| the CLI updates itself and a flag changes (it went 2.1.299 → 2.1.306 on 2026-10-21) | `claude_cli_status` records the version; `CLI_FAILED` carries the stderr tail; documented flags only |
| Claude 5.5 rejects edited history containing replayed thinking (Route A) | live check with the author's key; only the newest part's blocks are replayed (`tests/aiStaged.reasoningReplayScope.test.ts`) |
| an `ANTHROPIC_API_KEY` in the player's environment bills the API | B1's environment test; the status row shows `authMethod` |
| the two open sessions conflict in `providerFetch.ts` / `providerCall.ts` | PR B starts after the abort fix merges |
| the synced tier choice breaks the phone | B3 fallback and its test |
| latency feels too slow | measured in the live check; the long-lived-process option stays open (design §6) |

## 5. Verification

- `npx vitest run`, `npx tsc --noEmit`, `node scripts/build-standalone.mjs`;
  `engine-review` on both PRs.
- PR B: `RUSTUP_TOOLCHAIN=1.99.1 npx tauri build`, the `cargo test` above,
  and launching the built app; the Settings row should show "Signed in
  (Max)".
- **Live checks** (they draw on the author's subscription and key, so they
  need the author's go): one played turn on "Claude Sonnet (subscription)"
  with a roll in it, timed; Stop during a GM round kills the process; one
  played turn on "Claude Sonnet 5.5" through OpenRouter, with the cached-token
  count read from the usage that comes back.

## 6. Deliberately not built

Restated from design §6: no long-lived CLI process, no streamed GM-round
text, no remaining-usage display. The Designer works on a subscription model
only because `providerFetch` serves it like any other caller; it gets no
work of its own here.

## 7. Addendum — PR C: GLM through Z.ai and OpenRouter (decision 18)

**Order:** after PR A, before PR B (B waits on the Stop fix anyway). Touches
the same files as PR A, so it follows it rather than running beside it.

### C1. The Z.ai provider

| file | change |
|---|---|
| `app/misc/providerCall.ts` | `Provider` gains `"zai"`; `PROVIDER_NAMES` gains `"Z.ai"`; base URL `https://api.z.ai/api/paas/v4/chat/completions` (OpenAI-compatible, `Authorization: Bearer`); `applyReasoningEffort`: `none`/`low` → `low`, `normal`/`high` → `high`, `xhigh` → `max`, always with `thinking: {type: "enabled"}` (disabling is rejected). Strip a trailing assistant prefill when tools are present, as for the other OpenAI-style providers. **Check at build:** whether GLM-5.3 needs its `reasoning_content` handed back inside a tool loop the way DeepSeek does (`providerCall.ts:~475-495`); if so, extend that branch to `zai`. |
| `app/misc/ai_prices.ts` | `"GLM 5.3 (Z.ai)"` → `glm-5.3`, `"GLM 5.3 Flash (Z.ai)"` → the Flash id from Z.ai's model list (verify; likely `glm-5.3-flash`), provider `zai`, 1M / 128k, prices from Z.ai's pricing page; `PROVIDER_KEY_FIELD` gains `zai: "zaiKey"`. |
| `app/misc/APIKeysContext.tsx` and the API key modal | a `zaiKey` field and its input, labelled "Z.ai API key (pay-as-you-go, not the Coding Plan)". |
| `app/misc/sideModelCall.ts` (`pickProviderKeys`) and every caller that lists the provider keys (`ProviderKeys`, `GenerateRequestBody`, `generation.ts`, `menu.tsx`, the Designer) | forward `zaiKey` alongside the other five. |
| `src-tauri/capabilities/default.json` | allow `https://api.z.ai/api/paas/*` only. |
| `app/misc/syncableSettingsKeys.ts` | check how the other keys are synced, and treat `zaiKey` the same way. |

### C2. GLM 5.3 through OpenRouter

Add `"GLM 5.3"` (`z-ai/glm-5.3`) and `"GLM 5.3 Flash"` (`z-ai/glm-5.3-flash`) next
to `"GLM 5.2"` in `ai_prices.ts`. **Read prices live** from OpenRouter's
`/api/v1/models` at build time — on 2026-10-21 it listed GLM 5.3 at an
implausible $0.08 in, and the existing GLM 5.2 entry's prices ($0.65 / $2.10)
no longer match what it lists; fix GLM 5.2's prices in the same change.

### C3. Tests

- `tests/providerCall.zai.test.ts` (in the style of
  `providerCall.reasoning.test.ts`): the URL is the general endpoint, never
  `/coding/`; the effort mapping; `thinking.type` is always `enabled`; the
  prefill is stripped with tools.
- Update `tests/sideModelCall.test.ts` ("all five keys forwarded and nothing
  else" becomes six) and `tests/generation.sideCallKeys.test.ts`.
- `aiStaged.gmStageBudget` covers the new catalog keys automatically.

**PR C done when:** suite, `tsc` and the standalone build pass,
`engine-review` has reviewed the diff, and the PR is open. A played turn on
the author's Z.ai key is a live check that needs the author's go.

## Decisions made during implementation

### 2026-10-21 — Route A (PR A)

1. **`temperature` is omitted too, not only the story stage's sampling
   settings.** Both request builders set a base `temperature` (0.7 by
   default; the GM sends 0.4 plus the Chaos Factor nudge). Opus 5.5 rejects
   any temperature and Sonnet/Haiku 5.5 reject non-default values, and
   OpenRouter lists no sampling parameters for these models at all. Claude
   gets none of them on either path.
2. **A mid-history prefill is dropped as well as a trailing one.** On a tier
   with effort `none` the GM prompt ends in the `<thinking>` prefill. From
   round 2 on, that prefill sits between the player's action and round 1's
   assistant message; the two merge into one assistant turn, and a turn that
   continues a tool loop must open with its thinking block, not text. For
   Claude, within the current turn only (after the last user message), a
   plain assistant message (no tool calls, no reasoning) directly followed
   by an assistant message carrying tool calls or reasoning is dropped
   (`dropClaudeMidHistoryPrefills`). The first version ran over the whole
   history; the engine review caught that it then dropped prose the player
   read from earlier turns. A round the roll gate sent back is saved
   without the gate's re-prompt, so an older turn can hold prose followed
   directly by a tool call.
3. **Thinking replay for Claude is scoped to the current turn, and plain-text
   `reasoning` is never sent.** Design §3.3 flagged the edited-history check
   as the first thing to watch. The GM's state message (`messages[1]`)
   changes every turn, so the previous turn's thinking blocks would always
   sit in edited history. Only `reasoning_details` (signed) on assistant
   messages after the last user message go back; that is what a tool loop
   needs. A gate's re-prompt is a user message, so blocks before it are
   dropped too, which Claude accepts.
4. **Where the cache breakpoints go.** The plan names the system and state
   messages; the history between the state message and the player's action
   is also identical in every round of a turn and is the larger part (60% of
   the GM budget), so the breakpoint goes on the player's action instead.
   The provider cannot find that message by role (past turns replay `tool`
   messages), so `buildGMStagePrompt` marks it: `ChatMessage.cacheBreakpoint`
   (optional, in both `chatMessage.ts` and `providerCall.ts`; every other
   provider's message builder drops it). `providerCall` puts two breakpoints
   on a Claude request: the system message, which hits across turns while
   the system prompt's per-turn notes are unchanged and costs nothing extra
   in a turn's first round because the whole base is written then anyway,
   and the marked message. Only on requests that carry tools: the story
   stage reuses the same base messages without tools, and since the tool
   list starts Claude's cached prefix it could only pay the write premium,
   never read the GM's entry.
5. **A Claude call is billed at OpenRouter's own figure.** List-price
   arithmetic on `prompt_tokens` would bill a cached GM round about 20 times
   over, against CLAUDE.md's "real dollar estimates". OpenRouter returns
   `usage.cost` on every response, so for Claude `providerCall` passes it as
   `meta.estimatedCost`, which the ledger already prefers over its own
   arithmetic. Under OpenRouter's BYOK, `cost` is only OpenRouter's fee, so
   `cost_details.upstream_inference_cost` is added. Other OpenRouter models
   stay on list prices: switching them too changes the panel for every
   default tier and is a separate call. The cache counts also appear on the
   "AI generation complete" Debug Log lines, where the live check reads
   them.
6. **Two estimates stay at list price.** The "Cost per turn" estimate above
   the tiers prices Claude without the cache. And an effort-`none` Claude
   slot reads "None" in Settings and is estimated without reasoning,
   though Claude runs it at `low`. Both are estimates, not the ledger, so
   they are left as a follow-up.
7. **Custom OpenRouter models with an `anthropic/` id get the Claude branch**
   (`isAnthropicViaOpenRouter` keys on the model id), so Fable 5.1 added as a
   custom model (decision 15) works the same way.
8. **`generation.ts` is untouched**, which also keeps clear of the open
   session editing it.
9. **Claude's `max_tokens` has a 4,096 floor.** Claude 5.5 always thinks,
   and thinking counts against `max_tokens`. So the 200–300 token caps the
   side agents use for a verdict, and the classifier's 10, could be spent
   before any text arrives, and the call would come back empty without a
   warning (the silent side-call family). OpenRouter also documents turning
   `reasoning.effort` into a thinking budget of at least 1,024 tokens that
   must stay below `max_tokens`, which a small Response Length on the GM
   stage would break. The floor is a cap, not a charge. Found by the engine
   review.
10. **The PDF importer's OCR call drops `temperature` for Claude.** Its
    model picker lists every catalog model, and `callProviderAI`
    (`ocrSummarizeCall.ts`) builds its own request outside `providerCall`
    with `temperature: 0.3`. Found by the engine review.
11. **Hazards left for the live check, not coded around.** The engine
    review named five API behaviours that unit tests cannot settle:
    escalating into a Claude tier mid-tool-loop; the story stage sending
    tool history without `tools`; the Designer's trailing system message;
    side agents on Claude; the signature merge from the stream. Each is a
    check with its failure written down in `pending_tests.md`. Building
    around behaviour nobody has seen fail would be guessing.
