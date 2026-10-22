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

### Interview five, continued — the design's open questions (2026-10-22)

The author read the design ([`default-systems-design.md`](default-systems-design.md))
and answered its open questions (§7), the proposed rules (§5.4) and the
renames (§5.7).

| # | question | decision |
|---|---|---|
| 78 | An `action_roll` tool for Ironsworn-style games, or the three-call recipe (`formula_roll`, then `calculate` per challenge die, the cap at 10 applied by hand) | **Add `action_roll`** ("Add action_roll"). Stat and adds in; the engine caps adds at +2 and the score at 10, rolls, compares, and returns strong hit, weak hit or miss, the dice and whether they matched. |
| 79 | Offer the meter, track and session tools to every story, or only to adventures that use them | **Only to adventures that use them** ("Only adventures that use them"). A pack sets a flag when imported; the Designer can set it by hand. |
| 80 | Who counts the Reckoning's 1s | **The GM, for now** ("The GM, for now"): `formula_roll` shows every die, the GM counts and raises Beast with `manage_meter`. |
| 81 | Built-in packs and the starter: in memory or written to the device | **Kept in memory** ("Kept in memory"), merged into the library lists from the app's own code, never written to IndexedDB; importing makes an editable copy. |
| 82 | Shipping Blood & Bone's AI edition in the public repository | **Yes, publish it** ("Yes, publish it"), under the project's licence with the Tomkin Press credit line. |
| 83 | The Witch's Ledger | **As proposed** ("As proposed"): 10 marks; a Sate ritual costs 1, then +1 for each further ritual that night (Hedge Witch flat 1, Servant starting at 2); a full Ledger brings the source's demand; meeting it drops the Ledger to 5, or to 0 with *The Clean Slate*. |
| 84 | The Wendigo's "the hunger only grows" | **Tied to the Beast Meter** ("Tie it to Beast"): the "starving" trigger fires at the third foodless dawn at Beast 0–2, the second at Beast 3–5, and every foodless dawn from Beast 6. |
| 85 | What the Predator gets, now that any feed resets the Slipping Mask | **A kill holds the Mask a night** ("A kill holds the Mask a night"): killing living prey resets the Mask, and the next dawn does not advance it. |
| 86 | The remaining proposed rules (§5.4) | **All accepted as written**: a Stress spike is +2; the Rogue's line reads "a complication from your Doomed burden"; the Slipping Mask is a 0–3 meter (+1 per foodless dawn, +2 for the Graverobber, a Sate the Beast hit sets it to 0); *Resist the Hunger* is a new +Heart move, and Resisting the Change gains its strong and weak outcomes; fights go by rank; the Fading's penalty is a stat counting as 0 or a Connection out of reach, with *The Still Self* counting Stress as 2 lower for the threshold. |
| 87 | The renames for names the book uses twice (§5.7) | **All four accepted**: the Rite *The Reckoning* becomes *The Calling Due*, the Rite *The Vigil* becomes *The Wake*, the Haven *The Hollow* becomes *The Forgotten Room*, and the Werewolf's Beast track *The Turning* becomes *The Wild*. |
| 88 | Is the design approved | **Approved; write the implementation plan** ("Approved: write the plan"). Building still waits for the author's yes on that plan. |
| 89 | How the rulebook reaches a build session, since it existed only as an upload | **Committed to the repository** ("Commit the book to the repo"), as `docs/blood-and-bone/rulebook.md`, with decision 69's rewrites applied and the credits completed, as the source the AI edition is written from. |

### Interview six — party mode on the desktop (2026-10-21)

Party mode's own calls are 21–28 and 31. Numbers 10–20 and 29–30 are in the
Claude-GM interviews above (decision 30 says subscription Claude models stay
allowed in party mode, as in couch co-op), and 62–89 are in the default-systems
interview. The design session called this one "Interview four"; that name had
been taken by the time it landed.

| # | question | decision |
|---|---|---|
| 21 | What party mode is | **The desktop app is the table; every player plays from their own phone.** The desktop shows a QR code. Scanning it opens the Android app if installed, otherwise a phone web client served by the desktop over the home network. The spotlight rule carries over: taking it from someone locks them out for a cooldown. Later, an auto-voice mode gives the spotlight to whoever is speaking. (The author's request.) |
| 22 | What the phone shows | **A controller**, Jackbox-style: that player's character, their spotlight button and cooldown, typing or voice input, the suggested choices, and rolls or questions the GM asks them. The desktop shows the story. **Phones never receive the GM's secrets.** |
| 23 | When the turn goes to the GM | **Like today: lines queue, then anyone taps "Go"**, on a phone or the desktop. |
| 24 | The spotlight cooldown in party mode | **About 15 seconds, as a setting.** (Couch mode's 4 s is unchanged.) |
| 25 | Phones that join through the browser | **Type and tap; voice needs the Android app.** A plain-HTTP page on the home network gets no microphone, and a self-signed certificate would show every guest a warning. |
| 26 | Does the spotlight gate typing and choices in party mode | **Yes, everything.** In party mode you need the spotlight to add any line: voice, typed, or a choice tap. |
| 27 | Joining after the game has started | **Yes, through a "Join" button** that shows the QR again; the newcomer picks a name and colour and joins the table and the GM's player list. |
| 28 | Build party mode | **Yes, starting with PR P1** ("Yes, start with PR P1"): `docs/party-mode-implementation-plan.md` as written, beginning with the S0 spike with the author and a phone. Each PR needs its own yes to merge (decision 5). |
| 31 | The S0 phone test had to wait | **Build S2 first, stop before S1** ("Build S2 meanwhile"): the pure-TypeScript protocol, host state machine, redaction boundary and turn-text extraction went ahead while the author had no phone to hand. Nothing in Rust, no UI and nothing that opens a port until S0 passes. |

### Interview — tokens, history and compaction (2026-10-22)

After #213 merged, the author asked to "discuss how to improve our
notes/memory system and save on tokens. One thing that we for sure need is
the compaction tool of claude code." The measurements and the design are
[`token-savings-design.md`](token-savings-design.md).

| # | question | decision |
|---|---|---|
| 90 | What happens to old tool results (notes read, edits made), which are replayed in full every later turn | **Cleared once, as the turn ends** ("Once, as the turn ends"), after the author asked whether clearing would break caching ("won't it fuck with caching?") and was shown that clearing a turn's results once, when it becomes history, is cache-safe while a rolling "keep the last N turns" is not. Later turns see a one-line stub per long result; short results (dice, oracle, confirmations) stay. |
| 91 | Rearranging the prompt so each request mostly matches the previous one | **A stable prefix** ("Stable prefix"): the per-turn lines move next to the player's latest action, and history keeps a fixed start between summaries instead of sliding by one turn each turn. |
| 92 | The 15.8k tokens of tool descriptions sent every round | **One stable list, trimmed** ("One stable list, trimmed"): every tool in every round so the list caches, with shorter descriptions. |
| 93 | What goes wrong with memory beyond cost | **"Mostly just cost."** The memory half of the work is about history and summaries, not recall quality. |
| 94 | When history is summarised | **When the real history passes the budget** ("When real history passes the budget"): count everything actually sent, summarise the oldest chunk down to a target, and between summaries let history grow only at the end. |
| 95 | How summaries are written and steered | **All four** ("Fixed sections, A 'Compact now' action, Summary instructions per adventure, Summarise tool use too"): fixed headings; a story-menu "Compact now" with optional focus text; a per-adventure note of summary instructions; and what the GM learned from tools folded into the summary. |
| 96 | A size limit on always-loaded notes | **Warn, then cap the total** ("Warn, then cap the total"): a warning when one always-loaded note passes about 3,000 tokens; past a total of about 10,000 the GM prompt keeps the first part of each and points to `read_notes` for the rest. |
| 97 | This work or the approved default-systems plan first | **Token savings first** ("Token savings first"). Default systems' PR A follows on the new prompt layout. |
| 98 | What next | **Write the design document** ("Write the design doc"), with these decisions, the measurements and the bugs found; nothing built until the author has read it and said yes. |

### Interview — tokens, continued: the design's open calls (2026-10-22)

The author read [`token-savings-design.md`](token-savings-design.md) and
answered the calls the session had made inside decisions 90–98, and the
design's open questions.

| # | question | decision |
|---|---|---|
| 99 | Whether an old turn's private `<thinking>` text goes with its tool results | **Drop it** ("Drop it"). The prose the player saw stays. |
| 100 | Where the always-loaded character sheet sits, since the GM edits it often | **Next to the action** ("Next to the action"), in the live block, so an edit no longer breaks the cache for the history. |
| 101 | How far a summary folds history back | **To half the budget** ("Half the budget"), so a summary runs every few dozen turns. |
| 102 | What "Compact now" keeps word for word | **The last two turns** ("The last two turns"). |
| 103 | The stub threshold (~150 tokens) and the summary target (~2,000) | **Defaults, tuned in playtests** ("Defaults, tune in playtests"): set as constants in code. |
| 104 | Claude's 5-minute or 1-hour cache | **Measure first** ("Measure first"): 5 minutes, cache hits recorded in the ledger, and the stable prefix moved to 1 hour if Claude players keep missing between turns. |
| 105 | When to confirm the caching on a real model | **One session after the build** ("One session after the build"), once the ledger records cached tokens, on the default models; a pending test until the author says go. |
| 106 | Is the design approved | **Approved; write the implementation plan** ("Approved: write the plan"). Building waits for the author's yes on the plan. |
| 107 | Build the token-savings plan | **Approved** (2026-10-22, to the coordinating session: "Approved. Also pull from origin and do the token saving + default system plans."). `token-savings-implementation-plan.md` is built in three PRs, T1 (slices 1-4) first; each merge still waits for the author (decision 5). |

### Interview seven — model catalog and defaults (2026-10-21)

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
