# Decisions — the author's log

Running log of the author's answers. Each answer is a numbered decision, and
plans, PRs and docs cite these numbers ("decision 3") instead of restating
the reasoning. Numbers are never reused; a decision that is reversed stays in
the log with a line saying which later decision replaced it.

Started 2026-10-21, when the working loop came over from Beat Them Right
(decision 9). Decisions made before then live in the design documents and
in git history; the ones below are the first written down here.

**How a decision gets here:** the author answers a question (in an
`AskUserQuestion` interview, or in plain chat), and the session that asked
appends it under a dated interview heading in the same change as the work
it unblocks. Write down what was decided and the author's own words where
they matter, not the discussion around it.

### Interview one — after the idle weeks (2026-10-20/21)

The health check after ~11 weeks idle
([`status-report-2026-10-20.md`](status-report-2026-10-20.md)) and the
Q&A that followed it.

| # | question | decision |
|---|---|---|
| 1 | Which platform is the product | **The native apps first.** Tauri desktop and Capacitor Android/iOS, packaged from the `NEXT_PUBLIC_STANDALONE=true` static export. No public website: "Yeah native app is the priority. Website is not a good idea." The Vercel deploy is a testing vehicle only. |
| 2 | The web-only layers | **Drop them.** `@ducanh2912/next-pwa`, the PWA manifest and the unused Vercel analytics removed (PR #192). It followed from decision 1; the author started the proposed session. |
| 3 | Prima Materia's copied tables, with the repo public | **Strip them now.** The book's appendix tables and keyword sets removed, original placeholders written in their place, the mechanism kept (PR #200). Git history still holds the original text; whether to rewrite it is open. |
| 4 | Two sessions fixed each of two bugs | **Keep #195 and #197.** #194 and #196 closed as duplicates and their sessions archived. |
| 5 | Who merges | **The session merges when the author says so**, one PR at a time with `--merge`, master pulled and the suite run after each, stopping on a failure or a needed rebase. Given for #190–#197 ("Yes, merge in order with tests"), then #199/#200 ("Yes merge") and #198/#201 ("Do them", with #201 checked by a real `tauri build` first). Each merge still needs its own yes. |
| 6 | The terms page | **The rewrite session's defaults, with GitHub issues as the contact.** 18+ kept; the content rules cover what is shared, and the rule on content sexualising minors applies everywhere; a line on only importing PDFs you have the right to use (PR #199). |
| 7 | "Copy invite link" in the native apps | **Copy a text invite** with the room code and connection type, since a native origin is not a link anyone else can open (PR #198). |
| 8 | OpenRouter "Connect" in the native apps | **The system browser and a pasted code**: OpenRouter's headless PKCE flow, the auth page opened by `tauri-plugin-opener` / Capacitor Browser, the code pasted back into the app (PR #201). The web build keeps the redirect flow. |
| 9 | How sessions work in this repo | **Beat Them Right's working loop**: its `CLAUDE.md` working rules, `docs/workflow.md`, and its `.claude/` agents, skills, hook and permissions, adapted to this repo. Kilo is not carried over: "You can ignore the kilo workflow since I moved to claude agents." |

### Interview two — Claude as the game master (2026-10-21)

| # | question | decision |
|---|---|---|
| 10 | How to play with Claude | **Two routes: Claude models through the player's OpenRouter key, and the player's own Claude subscription through the `claude` CLI on the desktop app.** Not an Anthropic API key for now: "Actually no, let's just do open router and subscription on the desktop." The subscription route drives the unmodified, signed-in `claude` binary; the app never touches the subscription's credentials (Anthropic's Claude Code terms forbid apps routing requests through Pro/Max credentials or handling Claude.ai tokens). It is desktop only: a phone cannot run the CLI, and relaying from the phone through the PC is ruled out. |
| 11 | Who runs the GM loop on the subscription route | **The app keeps its loop.** Each GM round asks the `claude` CLI, with Claude Code's own tools off, for narration plus the tool calls it wants as structured JSON; the app executes the tools. The roll and plan gates, mid-turn tier switching and the round cap keep working. Not Claude Code running the loop over MCP. |
| 12 | What runs on the subscription | **The GM rounds and the story narration.** The side agents (Observer judges, Memory Keeper, Director, Reflection, compaction) stay on their current models unless the player points one at Claude in Settings. |
| 13 | How the subscription models are picked | **As models in the existing pickers** — "Claude Opus / Sonnet / Haiku (subscription)" on desktop, assigned to the reasoning tiers and narration like any other model. Not a single global switch. |
| 14 | Test calls on the author's subscription during planning | **Yes, after the author signs the CLI in** — a handful of one-line prompts to settle the two undocumented points (structured output with tools off; per-launch overhead). |
| 15 | Claude Fable 5.1 through OpenRouter | **Leave it out.** The catalog gets Haiku 5.5, Sonnet 5.5 and Opus 5.5; Fable can still be added as a custom OpenRouter model. |
| 16 | A synced subscription model on a device without the CLI | **Fall back with a notice.** That slot uses its default model there, and Settings says why; the desktop keeps the subscription. |
| 17 | Build the Claude GM plan | **Yes, both routes** ("Yes, build both routes"): `docs/claude-gm-implementation-plan.md` as written, Route A first in a fresh session, Route B after the native Stop fix merges. Each PR still needs its own yes to merge (decision 5). |
| 18 | Z.ai's GLM Coding Plan in the game | **Not the Coding Plan** — Z.ai limits it to "officially supported tools and products" and forbids "unsupported tools or scenarios"; routing it through the `claude` CLI would be an unsupported scenario too. **Instead, both:** Z.ai as a direct BYOK provider on its general pay-as-you-go API (which also spends the author's GLM token packages), and GLM 5.3 entries through OpenRouter as a fallback. Answer: "Both". |

### Interview three — the side agents' model (2026-10-21)

A turn's side agents were taking their model from the provider's own model id,
which the proxy cannot resolve, so all of them silently ran on DeepSeek V4
Flash, and a player without a DeepSeek key got none of them.

| # | question | decision |
|---|---|---|
| 19 | What the side agents run on when no per-layer override is pinned in Settings > Architecture | **(Revised by decision 51: the side agents now have their own default, Claude Haiku 5.5, and no longer follow the narration model.)** **The narration model**: `getEffectiveNarrationModelKey()`, Mistral Small 3.2 unless the player set another. This covers the Observer's judges and its rewrite, the Memory Keeper, the Director Assistant, the Story Progress Observer, choices re-derived after a rewrite, compaction and reflection. The rejected options were "the model that wrote the turn" (on most turns the GM's tier model, which on combat and boss turns is Grok 4.5 or Kimi K3, 15–50× the price) and keeping DeepSeek V4 Flash on purpose (it needs a DeepSeek key). |

### Interview two, continued — PR C (2026-10-21)

| # | question | decision |
|---|---|---|
| 20 | Build PR C (decision 18's GLM routes) | **Yes** ("Okay go on", 2026-10-21): GLM through Z.ai's general pay-as-you-go API as a new `zai` provider, GLM 5.3 entries through OpenRouter, and GLM 5.2's prices corrected, as in the plan's addendum (§7). Order: after PR A (#205), before the subscription route (PR B). Decision 19 is the side agents' model, in PR #204. |

### Interview four — the subscription and other people's devices (2026-10-21)

Numbers 21–28 belong to other sessions.

| # | question | decision |
|---|---|---|
| 29 | Subscription models in an online multiplayer game | **Block them during online play** ("Block during online play"). While an online session (`NetSession`, host or guest) is active, a `claude-cli` model is treated as one the device cannot run: each tier, the narration voice and every side-agent layer uses its default model, with a notice in Settings and in the game. Solo play and couch co-op on one device are unchanged. It follows design §5.2, "never relay a request from another device": in an online game guests' actions on their own devices become the host's turn. |
| 30 | Subscription models in party mode (the LAN feature, friends' phones as controllers for the host's desktop game) | **Allow them, like couch co-op** ("Allow, like couch co-op"). The game, the GM loop and the CLI all stay on the one desktop that owns the plan; the phones only send input to it. Party mode is not on master yet; nothing in the subscription code looks at it, and a session building it must not add a block. |

### Interview five — model catalog and defaults (2026-10-21)

The model catalog was checked against OpenRouter's live list and each
vendor's pricing page the same day
([`research/gm-models-2026-10-21.md`](research/gm-models-2026-10-21.md), the
update note under §6), and the author was then asked which models the game
should start on. Numbers 31–49 belong to other sessions.

| # | question | decision |
|---|---|---|
| 50 | "Should the default model tiers change too? (Players can always override them in Settings.)" | **"Balanced."** Tier 0 (banter) and tier 1 (ordinary checks) on **Claude Haiku 5.5**, tier 2 (combat and rules) on **GLM 5.3**, tier 3 (boss and campaign) on **Claude Sonnet 5.5**, and the narration voice on **GLM 5.3**. The option as put to the author: "Banter and ordinary checks: Claude Haiku 5.5 (fastest, about $0.001 per turn with caching). Combat and rules: GLM 5.3. Boss and campaign tier: Claude Sonnet 5.5. Narration: GLM 5.3, whose prose ranks in the top 6 and which isn't bound by Claude's content rules. Needs an OpenRouter key; GLM can also use your Z.ai key." It replaces Mistral Nemo, Mistral Small 3.2, Grok 4.5 and Kimi K3, with narration on Mistral Small 3.2 (`REASONING_TIERS` and `NARRATION_MODEL_KEY` in `reasoningTiers.ts`). The efforts stay as they were (none, none, high, xhigh): `providerCall.ts` already sends Claude's `none` as `low`, and sends GLM 5.3 and Sonnet their `high` and `xhigh`. "GLM 5.3" is the OpenRouter entry, not "GLM 5.3 (Z.ai)": the Z.ai key is used by picking the Z.ai entry in Settings, and nothing switches to it by itself. The old models stay in the catalog and in the pickers, and a player's saved overrides are untouched. |
| 51 | "With narration moving to GLM 5.3, what should the side agents (Observer judges, Memory Keeper, Director, Reflection, compaction) run on by default?" | **"Claude Haiku 5.5."** The option as put to the author: "Their own cheap default, about Mistral Small's price ($0.10 in / $0.50 out) and the fastest model in the research. Uses the same OpenRouter key the new defaults need. Revises decision 19, which tied them to the narration model." It is `SIDE_AGENT_DEFAULT_MODEL_KEY` in `layerSettings.ts`, and covers the Observer's judges (its rewrite moved to the narration voice by decision 52), the Memory Keeper, the Director Assistant, the Story Progress Observer, compaction and reflection. A layer the player pinned keeps its pin; a pin the catalog dropped, or a Claude subscription pin this device cannot run (decisions 16 and 29), falls to Haiku 5.5 rather than to the narration model. It is the OpenRouter model, never "Claude Haiku (subscription)": an unpinned side agent still does not reach the subscription (decision 12). The choices call, including the one re-run after an Observer rewrite, is the narrator's and stays on the narration model. The Game Designer and the OCR summariser are not side agents here and keep their own model choice. When the player has no key for the side-agent default's provider, an unpinned side agent (or one whose subscription pin this device cannot run) runs on the narration voice instead, unless that is a subscription model (decision 12) or one they have no key for either, so a player without an OpenRouter key keeps their side agents; added after the engine review, 2026-10-21. |
| 52 | "When the Observer catches a mismatch it rewrites the turn's prose, and that rewrite is what the player reads. Which model should write it by default?" | **"The narrator, GLM 5.3."** The option as put to the author: "Prose the player reads stays with the narration voice. GLM isn't bound by Claude's content rules, so a dark or violent scene isn't refused or softened. The Observer's yes/no judges stay on Haiku. Costs a little more per rewrite, and rewrites are rare." An unpinned Observer's rewrite (the speculative, blocking and background ones) runs on the effective narration voice, `getEffectiveNarrationModelKey()`, through `resolveObserverRewriteModel` in `layerSettings.ts`; its judges stay on `SIDE_AGENT_DEFAULT_MODEL_KEY`. A pinned Observer still rewrites on its pin, and a pin this device cannot run or the catalog dropped falls to the narration voice. If the player set the narration voice to the Claude subscription on the desktop, the rewrite runs there too: it is the narrator's work, not a side agent's, so decision 12 does not apply to it. The turn cost estimate prices the rewrite the same way. |
| 53 | The author's direct request, not a multiple-choice question: "Fix the effort by giving them all an effort." (Some calls sent no reasoning effort at all, and `applyReasoningEffort` in `providerCall.ts` had to guess; a Claude call with no effort ran at `low` only because of a backstop added that day. The narration voice and the Game Designer had no effort setting, so a player who put Sonnet there could not choose how hard it thinks.) | **Every model call carries an explicit effort, each slot's effort is chosen alongside its model, and `"none"` is the default everywhere.** Decided by the coordinating session from the author's request, 2026-10-21, not from an interview. `"none"` (`DEFAULT_REASONING_EFFORT`, `reasoningTiers.ts`) is the cheapest effort each model allows: `applyReasoningEffort` sends Claude and GLM `low` (their thinking cannot be turned off), Z.ai `low`, DeepSeek thinking disabled and any other OpenRouter model `reasoning: {effort: "none"}`, which really turns reasoning off. (Corrected after the second engine review, 2026-10-22: OpenRouter marks some models' reasoning mandatory and rejects an explicit `"none"` for them, Grok 4.5 and 4.7, Qwen 3.8 Max, GPT-6.1 Sol and MiniMax M2 among the catalog's; they are flagged `reasoningMandatory` and sent `low` too, with the always-thinking `max_tokens` floor. As first written this row said `"none"` was safe on every provider, which would have broken the Designer, whose first available model on an OpenRouter-only profile is Grok 4.5.), and Mistral nothing. **Side agents:** `resolveSideCallModel` now always returns an effort, `SIDE_AGENT_DEFAULT_EFFORT` (`"none"`) for an unpinned layer and for a subscription pin the device cannot run (decisions 16 and 29), also when the layer falls to the narration voice for want of a key (decision 51), and a pin keeps its own; compaction, the Compact Story menu and the cost estimate pass it on like the rest. **Narration voice:** a stored `narrationEffortOverride` (synced beside `narrationModelOverride`), read by `getEffectiveNarrationEffort()`, a stored value that is not one of the five efforts reading as `"none"`. It applies to the story continuation, the choices call (including `generateChoicesOnly` and the re-run after an Observer rewrite) and an unpinned Observer's rewrite (`resolveObserverRewriteModel` returns it with the narration model, decision 52); a pinned Observer's rewrite keeps its pin's effort. When the voice falls back (a subscription voice this device cannot run, an online session, or a model the catalog dropped) the effort falls back to `"none"` with it. **Tier classifier:** runs at tier 0's effort. **Game Designer:** a stored `designerReasoningEffort` (its own key, not synced, like `designerModel`), picked beside the model on `/creator`. **Pickers:** the narration voice (Settings, AI Config) and the Designer are new; the tiers and the side-agent pins already had one. `callSideModel` sends `"none"` for a request that names no effort, `applyReasoningEffort`'s Claude-without-effort rule stays as a backstop, and `tests/everyCallCarriesEffort.test.ts` fails when an inline model call omits `reasoningEffort`. The OCR summariser, speech-to-text and text-to-speech calls are outside this decision. |
