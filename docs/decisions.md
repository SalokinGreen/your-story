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
| 19 | What the side agents run on when no per-layer override is pinned in Settings > Architecture | **The narration model**: `getEffectiveNarrationModelKey()`, Mistral Small 3.2 unless the player set another. This covers the Observer's judges and its rewrite, the Memory Keeper, the Director Assistant, the Story Progress Observer, choices re-derived after a rewrite, compaction and reflection. The rejected options were "the model that wrote the turn" (on most turns the GM's tier model, which on combat and boss turns is Grok 4.5 or Kimi K3, 15–50× the price) and keeping DeepSeek V4 Flash on purpose (it needs a DeepSeek key). |

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

### Interview five — default RPG systems, starting with Blood & Bone (2026-10-22)

The author shared *Blood & Bone*, their own modern-supernatural game built on
the Ironsworn engine, as the first of the "default RPG systems for our AI GM
experience", and asked for a review, then a Q&A. The review and the design are
[`default-systems-design.md`](default-systems-design.md). Numbers 31–61 belong
to other sessions.

| # | question | decision |
|---|---|---|
| 62 | Which default systems to build toward | **Blood & Bone first, more later** ("B&B first, more later"). Design the format for a default system, build Blood & Bone's AI edition as the first one, and add other systems once it plays well. |
| 63 | Where a default system lives in the app | **A pre-installed notes-library pack plus a ready-to-play starter adventure** ("Library pack + starter"). The rules ship as a pack the Designer can import into any adventure; a starter adventure is built on it. |
| 64 | How meters (Stress, Beast, Exposure) and progress tracks are kept | **Engine-tracked and generic** ("Engine-tracked, generic"). New meters and progress tracks any system can use: the GM asks for a change, and the engine clamps and does the box and tick arithmetic. An engine change with its own implementation plan. |
| 65 | The four bugs found in the review (rules notes are titles only though the docs say they are pinned; `calculate` turns `min(12,10)` into 1210; hidden note text reaches the narrator; `search_notes` returns disabled notes) | **Log them and correct the docs now** ("Log + correct docs now"): the status report's §6.15–6.18 and `CLAUDE.md`, in a docs-only change. The code fixes are planned separately. |
| 66 | What a "session" is in Blood & Bone, since the app has none | **One night in the story, with the Reckoning at dawn** ("One night, Reckoning at dawn"). Dawn is when the GM runs the Reckoning, resets once-per-session uses and offers downtime. |
| 67 | How a Rule of 3 fight plays out | **One roll per player turn** ("One roll per player turn"). Three exchanges; the player describes each action and its stat; the engine holds the Advantage tally between turns. |
| 68 | Which oracle answers yes/no questions | **Mythic's `fate_question`, with the book's other oracles as tables** ("Mythic yes/no, book's other tables"). The book's own d10 yes/no oracle is dropped; the Complication, Scene and "What They Want" oracles and the per-move miss tables become table notes. No engine change. |
| 69 | The Chapter 1 sentences that are near-verbatim from the Ironsworn rulebook (CC BY-NC-SA 4.0), with the repo public (decision 3) | **Rewritten in the author's voice by the session, reviewed by the author** ("I rewrite them, you review"). Rules unchanged; Tomkin Press's "based on Ironsworn" credit line and a not-an-official-product statement kept. |
| 70 | How much Stress a Kind's trigger adds, and how often | **+1, each distinct trigger at most once a scene** ("+1, each trigger once a scene"). Two different triggers in one scene give +2; the full moon's "all triggers apply" still works. |
| 71 | Where the Ghost's Fading penalty starts (the book contradicts itself) | **Stress 4+ as the base, 5+ for the Anchored, 3+ for the Unraveling** ("Base 4+, Anchored 5+, Unraveling 3+"). |
| 72 | How a system's always-loaded core rules reach the GM | **A pinned core, everything else on demand** ("Pinned core, rest on demand"). A core of about 3k tokens goes in a note type that loads in full every round; the rest stay `mechanics` notes the GM reads with `read_notes`. No engine change to note loading; the docs and the Designer's description of the `alwaysOn` flag are corrected. |
| 73 | The rules the book leaves undefined (the Ledger's size, the Wendigo's Slipping Mask, the roll to resist feeding, how far Stress "spikes", whether a Troublesome fight is one roll) | **The session proposes a rule for each, with its reasoning and odds, and the author settles them in review** ("I propose, you review"). |
| 74 | Whether the AI edition keeps every subsystem | **Keep them all; cut after playtests** ("Keep all, cut after playtest"). Anything the GM handles badly in play gets cut or simplified then. |
| 75 | What the pre-installed packs contain besides the rules | **Two packs, rules and setting** ("Rules pack + setting pack"): the rules, and *Europe by Night* as a separate pack so an author can use the rules with their own city. *The Hollow Hour* is the starter adventure and uses both. |
| 76 | When to test the predation content against real models (played turns on the author's keys) | **Once the edition is playable** ("Once the edition is playable"). The session flags it when the AI edition and starter exist; the author says go and picks the models. |
| 77 | What comes next | **One design document now** ("Write the design doc now"): the default-system format, the generic meters and tracks, and Blood & Bone's AI edition, published as a reading copy, with these decisions and the bug write-up in the same change. Nothing is built until the author has read it and said yes. |
