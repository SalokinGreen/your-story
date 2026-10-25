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
| 108 | Build the default-systems plan (2026-10-22, to the coordinating session) | **Approved** ("Approved. Also pull from origin and do the token saving + default system plans."; later "Yes merge everything"). `default-systems-implementation-plan.md` is built in three PRs, A (slices 1-5, the engine) first, on top of the token-savings prompt layout; each merge still waits for the author's word (decision 5). |

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
| 110 | How the cap shortens always-loaded notes ("When always-loaded notes go over the 10k budget, the cap keeps the start of each note (decision 96). But the campaign plan grows at the end, so its current beat is the part that gets cut. How should the cap shorten notes?") | **Keep the current beat.** Every note keeps its start; the campaign plan also keeps its last `## Current beat` section whole, after the kept front and the pointer. Revises how decision 96 shortens the plan. |

### Interview — the model picker (2026-10-23)

After the story screen merged (#227), the author asked: "simplify the model
picker. 5 models are unnecessary. We should have 3 models: narration, default,
and advanced. Or just 2. Default and advanced." Today Settings shows four GM
tier slots (0–3) and the narration voice. The design is
[`model-picker-design.md`](model-picker-design.md).

| # | question | decision |
|---|---|---|
| 118 | "How many model slots should Settings show?" | **"Default + Advanced (Recommended)."** Two slots; narration uses the Default model. |
| 119 | "When should the Advanced model be used?" | **"Automatically, as now (Recommended)."** The per-turn classifier and the GM's own escalation still decide: today's tiers 0–2 become Default, tier 3 becomes Advanced, and the per-scene cap on Advanced calls stays. |
| 120 | "What happens to the reasoning-effort pickers?" | **"One effort per slot (Recommended)."** |
| 121 | "The side agents … each have their own model picker today. What happens to them?" | **"Fold under an 'Advanced settings' section (Recommended)."** They keep working as now; their pickers move into a collapsed section. |
| 122 | "Which models should the two slots start on for a player who never changes them?" | **"Default GLM 5.3, Advanced Sonnet (Recommended)."** Everyday turns move up from Haiku to GLM 5.3; combat, rules and the prose stay on GLM 5.3; boss fights stay on Sonnet. |
| 123 | After Codex's review (2026-10-23): "Default runs everyday turns and combat/rules on GLM 5.3. Today combat and rules think at 'high' and everyday turns at 'low'. How should the Default slot's single effort work?" | **"Combat never below 'high' (Recommended)."** The Default effort applies to every Default turn, but a combat or rules turn (tier 2) never thinks below `high`; the picker's help says so. A narrowing of decision 120. |
| 124 | The design and the implementation plan, revised after Codex's review (2026-10-23) | **"approved"** — built as planned on `claude/model-picker`. |

### Interview — campaign setup that actually sets up (2026-10-23)

The author, after a Blood & Bone freeform start went wrong (a GM context export of it is the evidence: the GM asked three good questions, then never wrote a character sheet, a plan or `start_game`, re-read 4-9 rules notes every turn because history stubs cleared them, and narrated a scene with no foundation; the author: "Okay, this is a horrible campaign start, like I need a proper campaign intro"): "campaign setup doesn't work properly. We have to improve the workflow and stream line it better." The design is [`session-zero-design.md`](session-zero-design.md), the plan [`session-zero-plan.md`](session-zero-plan.md).

| # | question | decision |
|---|---|---|
| 142 | "How should campaign setup (session zero) feel to play?" | **"Choice between few choices and proposal, or full step by step build."** The player picks at the start: *quick* (2-4 key choices as tap-able options, then the GM proposes a complete character and campaign hook to accept or tweak) or *full* (the GM walks every step of the system's creation rules, one question at a time). Rejected: GM builds it all with one or two questions. |
| 143 | "Should the engine enforce the setup steps, so the GM can't start the story until the character sheet and campaign plan exist (and you've OK'd them)?" | **"Yes, enforce them (Recommended)."** Like the dice gate: narrating the opening before the sheet, the plan and the player's OK exist sends the GM back to finish setup. |
| 144 | "What should the campaign intro (the first real scene after setup) give you?" | **"A briefing, then the scene (Recommended)."** A short who-you-are / where / what's-at-stake prologue in the story's voice, then the opening scene with a clear first choice. Rejected: cinematic prologue only; straight into the scene. |
| 145 | "Should you see setup progress while it happens?" | **"Yes, a small checklist (Recommended)."** A slim strip above the composer (Concept · Character · Campaign · Start) that ticks as each is done, with the sheet and plan one tap away. Rejected: conversational only. |
| 146 | The author's direct request, not a multiple-choice question: "Right now we only have the GM asking questions you can choose in between, but Claude Code also has multiple choice questions." | **`ask_question` gains multi-select.** A question can be marked to allow several answers; the player ticks any number of options (plus free text where allowed), and the GM receives every pick. Single-choice stays the default. Part of the session-zero design. |
| 147 | The design and the implementation plan, revised after Codex's review (2026-10-23) | **"Approved"** — built as planned on `claude/session-zero`. |
| 148 | After the first real step-by-step setup (the author: "We need to make it more detailed. It was way too short for me at step by step", with a context export): "What felt too short in step-by-step setup? (pick all that apply)" | **All four:** "Too few steps (Recommended)", "Choices too thin", "No world or campaign input", "Character felt shallow". Step by step walks every step of the system's creation rules, and the engine refuses the setup card until each is covered. Every option says what it means in play, and each step opens with a short explanation. The player is asked about the setting, the tone and the kind of campaign before the plan is written. There are extra steps for who the character was, what they want and fear, how they look, and the people in their life. The export also showed two bugs, fixed in the same work: a setup turn ending on an empty round re-showed the first step's text, and the GM did not call `start_game` after the player pressed Start. The design is [`session-zero-detail-design.md`](session-zero-detail-design.md). |
| 149 | The detail plan, revised after Codex's review (2026-10-23), with the online-guest redaction (status report §6.12) left out as its own PR | **"Okay, approved"** — built as planned on `claude/session-zero-detail` (`docs/session-zero-detail-design.md`). |

### Interview — expanding Blood & Bone (2026-10-24)

The author: "Okay next we need to expand blood and bones by a lot". Blood & Bone's packs then held about 35,000 words: 7 Kinds with 2 Archetypes each, ~30 rules notes, *Europe by Night* (6 cities), one starter (*The Hollow Hour*), 3 oracles and the miss tables (decisions 62–89).

| # | question | decision |
|---|---|---|
| 150 | "What should Blood & Bone get more of?" (several allowed) | **All four:** "Setting & world" (cities, regions, factions, NPCs, secret histories, locations), "Oracles & tables" (NPC names, looks and motives, places, hooks, rumours, encounters), "Starter adventures" (more starters like *The Hollow Hour*) and "Character options" (Kinds, Archetypes, Powers, Paths, Relics, Rites, Companions). |
| 151 | "Where should the new material come from?" | **"I write it, you review (Recommended)."** Original text in Blood & Bone's voice and rules, grounded in real tabletop practice, drafted by Claude and read by the author before it ships. Nothing copied from another product (decision 3). Rejected: the author extends the rulebook first; both. |
| 152 | "How big is 'a lot' for a first round?" | **"Triple or more."** A full expansion book's worth, over many PRs and several sessions. Rejected: roughly double; one deep area first. |
| 153 | "Which should land first?" | **"Oracles & tables (Recommended)."** The quickest change at the table; the setting and the starters can lean on the tables afterwards. |
| 154 | "Where should the world grow?" | **"Deeper Europe first (Recommended)."** More European cities plus the countryside, borderlands and old places between them, and the factions that span them, before any new region. Rejected: go global; both in parallel. |
| 155 | "For character options: more of what exists, or new kinds of creature?" | **"Both (Recommended)."** A third Archetype per Kind, more Powers, Paths, Relics, Rites and Companions, and two or three new Kinds that fit the setting. |
| 156 | "Stories copy Blood & Bone's notes when they start, so a story started today would never see the new tables. Should older stories get the new material?" | **"Add new notes on load (Recommended)."** When a Blood & Bone story opens, built-in notes it doesn't have yet are added; notes already in the story are never touched, so edits survive, and corrections to existing notes are not pushed. Rejected: a button on the Lore page; new stories only. |
| 157 | "Tripling is ~70,000+ new words. How do you want to review it?" | **"Sample first, then PRs (Recommended)."** One small sample of each kind of material (a table family, a city, an Archetype) for the author to approve the voice and depth; then each themed PR ships with a readable artifact, read or skimmed before merging. Rejected: read every PR in full; spot-check. |
| 158 | The expansion design and roadmap (`docs/bb-expansion-design.md`, 2026-10-24) | **"approved"** — start with the E0 samples, then E1 once the samples are approved. |
| 159 | The E0 samples (`docs/bb-expansion-samples.md`: the People table family, Budapest, the Vampire's Courtier) | **"approved"** — the voice and depth for E1–E3. Build E1. |
| 160 | "E4 adds new Kinds, each with its own Beast, Stress triggers, Recover Move, weakness, Powers, two Archetypes and creation prompts. Which should they be? (Pick two or three.)" | **All four offered: Revenant, Changeling, Doppelgänger, Rusalka** (the author picked four, past the two or three asked). Revenant: the dead back in their own body for one purpose. Changeling: fae-touched, bound by bargains and iron. Doppelgänger: wears stolen faces and lives. Rusalka: the drowned of rivers and lakes. |
| 161 | The author's direct request, not a multiple-choice question: "We need to fix the powers. Like the gargoyle one that can listen to stones. Tier 1 only gives thematic. But all tiers of a power should give a mechanical advantage because we don't want to gatekeep cool stuff behind xp, like a gargoyle should be supposed to listen to stones if he really wants to and the world/gm agrees but the power should give him an advantage doing so." | **Every ability of every Power gives a mechanical edge.** The thing a Power describes is something a character may attempt whenever the fiction and the GM allow it; the Power makes them better at it: an add on a named move, a better outcome on a hit, an extra choice, or a penalty ignored. No ability is a permission or flavour alone. Applies to the seven original Kinds' Powers (`kinds.ts`), E3's Archetype and Kind Powers (`archetypes/`) and E4's new Kinds; the balance rules of the expansion design §7b still hold (adds never above +2 in total, a cost on a rule-bending third ability). |
| 162 | "Should decision 161 (every Power ability gives a mechanical edge) also cover Paths, Havens, Companions, Relics and Rites?" | **"Yes the rule should cover everything."** Every ability of every asset gives a mechanical edge too: an access, a skill or a contact is kept and gains an add or a better outcome where it is used. A limited-use ability that makes something true (a contact, an escape route, a favour paid now) already is one. Applies to `assets.ts` and E3's `assets-more/`; the §7b balance rules still hold. |
| 163 | E5 starters. The author: "an adventure similar to haunted hotel and another one called Grave Watcher" (a world where the supernatural is normal; Grave Watchers keep watch on huge graveyards from towers, like fire lookouts, because graveyards draw dark magic; a small town nearby holds the social life; the Watchers talk to each other by radio; the tower is their headquarters; a roster of Watchers to play, the rest joining as NPCs when there are only one or two players). Asked: "Which rules should Grave Watcher run on?" | **"B&B, Masquerade off (Recommended)."** Blood & Bone's moves, Stress, Beast and progress tracks, with Exposure and Heat swapped for the graveyard's own pressure; its own world, not Europe by Night. |
| 164 | "What are the Grave Watchers, and who's on the roster?" | **"Anything goes."** Any Kind, plus human Watchers. |
| 165 | "By 'similar to haunted hotel', what did you mean for the first adventure?" | **"Haunted Hotel the netflix show, a different adventure to grave watchers."** A second starter inspired by the premise and tone of the Netflix series: original names, places, characters and rules (decision 3). |
| 166 | "How long should each adventure be?" | **"Both campaigns."** Several sessions each, with a campaign plan the GM writes in session zero. |
| 167 | "What tone do you want for the hotel adventure?" | **"Comedy-horror (Recommended)."** Funny and warm, chaotic guests and ghost residents, real scares and stakes underneath; the B&B rules still bite. |
| 168 | "Who do the players play in the hotel?" | **"The family who inherit it (Recommended)."** Any B&B Kind allowed, human by default. |
| 169 | "Where are they set?" | **"Both in America, own worlds (Recommended)."** Grave Watcher in a valley town by the graveyard, the hotel in its own small town; neither is Europe by Night. |
| 170 | "Is Grave Watcher modern day or a period setting?" | **"Modern-ish, analogue (Recommended)."** Today, but the valley has bad signal: radios, paper logbooks, a pickup, a diner; phones work only in town. |
| 171 | The author on the first E5 design draft (`docs/bb-starters-design.md`): "Okay like it. Grave Watcher has to be a bit more slice of life, life sim, gilmore girls vibe." | **Grave Watcher is slice of life first.** Most of a session is life in the town (the diner, the regulars, relationships, town meetings, festivals, quick warm talk); the Watch is the job and the yard the weather of the place. The season runs on a town calendar; most radio traffic and most nights are quiet; Unrest climbs slowly with the campaign. The hotel design and the voice samples are liked as they are. |
| 172 | The author on the second E5 draft: "Add 9 regulars and 35 occasional visitors. And 100 types of people who might be encountered" | **Grave Watcher's town gets three layers of people:** 25 regulars (the 16 in the draft plus 9), NPCs with a running bit each; 35 occasional visitors with a when, in notes the GM reads; and a d100 table of kinds of people one might meet, plus d100 name tables. |
| 173 | The E5 design (`docs/bb-starters-design.md`, with decisions 171–172) | **"Go"**: build it, in the design's slice order. |
| 174 | The author: "Merge and then let codex review the whole BnB book" (after #241). Codex (gpt-6.1-sol, high) reviewed the book in five parts. Asked: "Some third-level abilities beat any enemy outright, whatever its rank (Clean Kill 3, River's Grip 3)… What should these do against big enemies?" | **"Cap them by rank (Recommended)."** Full effect on Troublesome and Dangerous foes; on Formidable and up they mark the enemy's track three times (Epic: once). Written once in the core's "Reading abilities" line. |
| 175 | "A few abilities have big effects with no cost or limit (Mist Form 3, Stone Skin 3, Regeneration 1, Wild Luck 2, The Killing Cold 3, Warded House 3, Confession)… How should these be handled?" | **"Add a light limit (Recommended)."** Each keeps its effect and gains the usual price: once a session, a scene, or Stress +1; Confession once a session. |
| 176 | "Rome's Curia Umbrae works within the Church, and the Vatican blesses hunter cells… What should it be?" | **"Independent order (Recommended)."** The Curia Umbrae is an invented secret order that uses churches as places; no Vatican involvement; its people and plots stay. |
| 177 | Codex's other findings on the book (about ninety; NPC-roll dependencies, unrecordable Advantage, partial rerolls, missing rules restored from the rulebook, contradictions, real-world facts) | **Fixed without asking**, as correctness, under the author's request for the review. The systemic ones are one core line, "Reading abilities": non-players never roll, "+1 Advantage" in a Rule of 3, the rank cap (174), rerolling the action die. |
| 178 | The author: "After you're done with the fixing. Merge it with main and do play testing and review the sessions together with Codex." The playtest (three sessions on the desktop app, the subscription, Haiku high and Sonnet) and Codex's review found eleven problems. Asked: "What should I fix now?" | **"All of it, one PR (Recommended)."** The matched-dice message now says the core's rule; a round claiming its tools are down is retried at any point of a turn, and "No such tool" counts; a new timer says it must be advanced by hand. The core picks the move from the objective, keeps the rolled miss entry, and names when dawn comes; Grave Watcher's Taint applies on any miss about a working; the GM prompt answers direct questions, shows every roll's outcome, keeps bookkeeping out of the story, and keeps secrets off the setup card. |
| 179 | The author: "Merge and give me the apk. Then engine reminder for dawn" (the playtest's open item: Haiku narrates the next morning and never calls end_session). Asked: "How should the engine make the GM run dawn?" | **"A dawn gate (Recommended)."** After the GM's prose, if the player's line or the GM's own prose crossed into the next day and nothing called end_session this turn, the GM is sent back once. Design: `docs/dawn-gate-design.md`. |
| 180 | "If the detection misfires ('two hours before dawn' is still night), what should the GM do?" | **"GM may decline (Recommended)."** The message says to carry on if dawn has not come, and never forces a tool call. |

### Interview — the reading themes reach the whole app (2026-10-23)

The author: "After the deprecation pruning, I want to work on making the themes reach all of the platform with ink being the default." Only the story screen uses the `ys-*` tokens today. The design is [`whole-app-themes-design.md`](whole-app-themes-design.md), the plan [`whole-app-themes-plan.md`](whole-app-themes-plan.md).

| # | question | decision |
|---|---|---|
| 137 | "How far should the themes reach?" | **"Everything (Recommended)."** Every screen: Library, Designer, Settings and its tabs, Notes/NPCs/Goals, AI Context and Logs, the PDF importer, home, terms/privacy, the party phone page, and the page background itself (today it follows the OS light/dark). Rejected: everything but the debug views; play screens only. |
| 138 | "Paper White is the only light theme. When it's picked, should every screen go light too?" | **"Yes, all screens (Recommended)."** Every screen has to work on a light background. Rejected: story text only; drop Paper White. |
| 139 | "The home page, Library and site header use blue-to-purple gradients today. What should they become?" | **"A subtle theme gradient."** A gentle gradient made from the theme's own colours, so it changes with the theme. Rejected: flat theme colours. |
| 140 | "Should party-mode phones follow the table's theme?" | **"Each phone its own."** Phones use their own saved theme (Ink by default). Rejected: follow the table. |
| 141 | The design and the implementation plan (2026-10-23) | **"Approved. Plus I noticed the theme doesn't change scroll bars. We need to fix that"** — the scrollbars join slice 1; then the author asked for Codex's review before building ("Codex time"). |

### Interview — Android: turns that survive leaving the app, and the back gesture (2026-10-23)

The author: "I want to be able to leave the app while it generates and it finishing generating instead of breaking. And when I use the back gesture I want it to work in the app instead of closing the app." The design is [`android-background-design.md`](android-background-design.md), the plan [`android-background-plan.md`](android-background-plan.md).

| # | question | decision |
|---|---|---|
| 132 | "To keep a turn alive while you're out of the app, Android requires a visible notification for as long as it runs. What should it do?" | **"'Writing…' + 'ready' ping (Recommended)."** An ongoing "Your Story is writing your turn…" notification while a turn generates, replaced by "Your turn is ready" (tap to open) when it finishes, only if the player is not in the app. Rejected: only "Writing…"; ask once first with an opt-out. |
| 133 | "What should the back gesture do at the top of each screen?" | **"Story → Library → leave (Recommended)."** Back closes whatever is open (dialog, picture, menu, sub-page); on the story itself it goes to the Library; on the Library home it puts the app in the background, like Home, and never kills it. Rejected: story → leave; a second back to confirm leaving. |
| 134 | "On the phone the GM's reply currently arrives all at once at the end instead of word by word, and Stop doesn't cancel the request on the phone. Fix those in this project?" | **"Yes, in this project (Recommended)."** |
| 135 | "If Android kills the app mid-turn anyway (low memory, swiped away), what should happen when you come back?" | **"Say so, offer Retry (Recommended)."** The player's line is kept and the story shows that the last turn was interrupted, with Retry. Rejected: retry automatically; as today. |
| 136 | The design and the implementation plan, revised after Codex's review (2026-10-23) | **"Approved"** — built as planned on `claude/android-background`. |

### Interview — removing the arcade leftovers (2026-10-23)

After the model picker merged (#228), the author asked: "The next project will be to remove all legacy features from the game especially UI. All the deprecated stuff like most of the features from when this was an arcade instead of proper AI gm. Like the attributes, inventory, etc. I noticed with our new default system adventure it's still the deprecated menu." The design is [`legacy-removal-design.md`](legacy-removal-design.md), the plan [`legacy-removal-plan.md`](legacy-removal-plan.md).

| # | question | decision |
|---|---|---|
| 125 | "Which screen showed you the old menu in the Hollow Hour story?" | **"Character creation form."** The pre-play form sorts the sheet template's fields into arcade categories by name (Heart and Power under "Attributes", Gear under "Equipment", the other nineteen under "Other") instead of the template's own headings; reproduced in the browser preview on a fresh Hollow Hour story. |
| 126 | "Old saves still hold structured stats, resources, inventory and abilities. What should happen to them?" | **"Drop them."** The arrays are deleted when a story loads; old arcade saves lose their structured stats and items. Rejected: fold them into the sheet note; leave them in storage unused. |
| 127 | "Variables are half-alive: boolean variables can gate lore notes, but only the hand editor sets them and no GM tool does. Keep or remove?" | **"Remove them (Recommended)."** The editor, the prompt section and the variable-gated lore triggers (`var_on_triggers`, `var_off_triggers`) go; note visibility covers reveals. |
| 128 | "Besides the dead arcade data and UI, what else should go in this cleanup?" (several allowed) | **All four:** the unoffered GM tools (game_over, delegate_task with its Web Research toggle and Brave key, reaction_check, negotiate_price, the ability tools, request_continuation, end_gm_thinking, add_memory); `take_rest`; New Game+ and the game-over screen; `rpgSystems.ts` and the skill trees. |
| 129 | "What should character creation be for an adventure with a sheet template like Blood & Bone's?" | **"No form, session zero builds it."** The pre-play form is deleted; the GM walks the player through the adventure's sheet template in session zero. Rejected: the form grouped by the template's headings; one page with the sheet as written. |
| 130 | "The 'Choose your character' screen shows only a Custom card when an adventure has no pre-made characters. What then?" | **"Skip it when Custom is the only choice (Recommended)."** The picker shows only when the adventure has pre-made characters, and the "Default Stats" / "Starter Items" badges go everywhere. |
| 131 | The design and the implementation plan, revised after Codex's review (2026-10-23) | **"Plan approved"** — built as planned on `claude/legacy-removal`. |

### Interview — the story screen (2026-10-22)

The author showed two phone screenshots of OOC, another AI story app, and said
"Let's work on the game UI. I like how simple OOC is." The design is
[`story-screen-design.md`](story-screen-design.md).

| # | question | decision |
|---|---|---|
| 112 | "Which parts of OOC's story screen do you want in ours?" (multiple choice) | **All four: "Plain prose page", "One slim header", "Quiet colours", "Composer with mode buttons."** No GM card around each turn, and the prose is in a book serif with pictures full width. The header is one row (back, title, menu), and the tab bar and title strip go into the menu. Near-black and white, with the accent kept for what needs attention. One input bar with a few small buttons. |
| 113 | "Should a quality or model picker sit in the header, like OOC's 'Superb'?" | **"No, keep it in Settings (Recommended)."** The tiers switch by themselves each turn (decision 50), so a single picker would mislead. |
| 114 | "Who is this mainly for: the phone, the desktop app, or both equally?" | **"Phone first (Recommended)."** Designed at 375 px; the desktop app uses the same layout in a centred reading column. |
| 115 | "Which buttons should sit next to our input bar?" (multiple choice) and "Where do a turn's actions go (regenerate, edit, illustrate, read aloud)?" | **"Talk to the GM (OOC)" and "Microphone"**, and **"Tap the last turn to show them (Recommended)."** The OOC button sends the message in (round brackets), which the GM prompt already treats as out of character. The microphone replaces the floating solo mic bubble. "Suggest actions" and "Continue" were not chosen. Retry, Undo, Edit, Illustrate and Read aloud show when the latest turn is tapped, and earlier turns offer Edit only. |
| 116 | The design handed over (2026-10-23), with its §8 list of calls made without asking | **"Okay go on with the plan."** The design is approved as written, its seven §8 calls included: the GM's working folds into one line, the player's action stays as a muted line, Ink is the default for new players only, couch co-op keeps its bubbles, the other pages keep their look, `ChoicesModal` is left alone, and earlier turns get Edit only if the edit handler copes. The implementation plan is [`story-screen-plan.md`](story-screen-plan.md). |
| 117 | The implementation plan, after Codex's review (2026-10-23), including its call 7 (a spoken solo turn lands in the input to be read and sent) | **"Go."** Built as planned, on `claude/story-screen`. |

### Interview — picture quality (2026-10-22)

The author tried Illustrate this on the phone and was "not very happy with the
image output". The picture came from FLUX.1 schnell, and the one-armed Bryn of
the prose was painted with two arms: schnell follows a prompt loosely, and the
button's brief writer saw only the turn's prose, with no setting and no notes on
how anyone looks.

| # | question | decision |
|---|---|---|
| 111 | "Which model should paint scenes by default? (This revises decision 61's 'Mixed' setup; portraits already use FLUX.2 [pro].)" and "Should I improve the brief the Illustrate button writes?" | **"FLUX.2 [pro] (Recommended)"** and **"Yes, richer brief (Recommended)."** Scenes and places now default to FLUX.2 [pro] on fal (about $0.03 a picture at the in-play size, against $0.0024); a save from before the change that holds schnell reads as the old default (`settingsVersion` in `imageSettings.ts`), and a schnell picked afterwards is kept. The Illustrate brief writer gets the premise, the looks of the NPCs named in the turn and of the player, and the turn before, writes up to about 90 words, and states telling traits (age, build, clothing, a missing limb, a scar) plainly; the GM's `generate_image` description says the same in one sentence. Revises decision 61 for scenes. |

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


### Interview eight — image generation in play (2026-10-21)

The author asked for image generation in play, through fal.ai, with an image tool for the GM: "I want us to add image gen to our game. It helps a lot. By adding fal.ai support and image generation tool to the model". Design: [`image-generation-design.md`](image-generation-design.md); plan: [`image-generation-implementation-plan.md`](image-generation-implementation-plan.md). Decisions 107 and 108 belong to other sessions.

| # | question | decision |
|---|---|---|
| 54 | "When should images be made during play?" | **"GM decides, plus a button."** The GM calls `generate_image` at moments that matter (a new location, an NPC's first appearance, a big reveal), within a per-scene cap, and the player has an **Illustrate this** button on any turn. Rejected: GM only, button only, every turn. |
| 55 | "What should images be made for?" (several allowed) | **All four:** scene illustrations (inline in the feed, under the turn), NPC portraits (saved on the NPC and reused, so they keep looking the same), the player character's portrait (from the character sheet, used as a reference), and locations and lore (saved on the note). |
| 56 | "How should cost be kept in check?" | **"Per-scene cap + shown cost."** At most N GM pictures per scene (default 2, adjustable), each picture's price in the turn cost panel, and a setting to turn GM pictures off. The cap is enforced by the engine and resets at the scene boundary; the player's own button does not count against it. Rejected: ask before each GM image; no cap. |
| 57 | "Which image providers should the GM's tool use?" | **"fal.ai, plus the existing ones."** fal.ai becomes a new key and the default when it is set; the tool also uses DeepInfra or OpenRouter when that is the key the player has. |
| 58 | "fal's docs warn against keeping a fal key in client code (they recommend a server, which the native apps don't have). Keep the fal key on your device like every other key?" | **"Yes, like the other keys."** Stored only on the device, sent only to fal, never synced, and not part of `pickProviderKeys`. Rejected: desktop only. |
| 59 | "Should generated images follow you to your other devices through sync?" | **"Stay on this device."** Pictures live in their own IndexedDB database, outside `StoryData` (the `ttsAudioCache.ts` precedent); `StoryData` holds only ids. Another device shows a placeholder with Regenerate. Rejected: sync them too. |
| 60 | "Online guests (and party-mode phones, once that lands) don't get images automatically. When should they?" | **"In a later PR."** The first PR is host-only, and guests see a placeholder. A follow-up sends each picture as its own message, the way `tts_audio` is sent. Rejected: in the first PR; host only, always. |
| 61 | "Which fal model should be the default? (You can change it in Settings.)" | **"Mixed."** FLUX.1 schnell for scene pictures, and FLUX.2 [pro] for portraits. Its edit mode takes the portraits as reference pictures for any scene with a known character in it. The engine picks the model by job, and each of the three is a Settings choice. Rejected: FLUX.2 pro for everything; schnell for everything. |
| 109 | The coordinating session asked whether the author's approval covered the image-generation plan (2026-10-22). | **"Build the image-generation plan"** (the author: "Yes"). `docs/image-generation-implementation-plan.md` is approved. Slice S7 (reference pictures) stays gated on live fal checks that need the author's key and go. |
| 181 | The author: "Also I want to rebrand from Your Story to Endless Adventure". Asked: "If the app IDs change, phones and PCs treat it as a different app and saved stories do not carry over. What should change?" | **"Names only, keep IDs (Recommended)."** Everything a player sees says Endless Adventure; `com.yourstory.app` and `com.yourstory.desktop` stay, so the apps update in place. (Decisions 179–180 are on the dawn-gate branch.) |
| 182 | "How far should the rename go behind the scenes?" | **"Player-facing + docs (Recommended)."** The app, its pages, store and install names, README and CLAUDE.md. Code names stay: the `ys-` tokens, `ys:` and `yourStory_` storage keys, file and folder names, the repository. |
| 183 | The author on the dawn-gate design: "Merge and give the design to codex. I think it's a great idea to make house systems that have proper code support like the dawn gate or action roll. It's open source, so people can just make their own default systems." | **Systems declare their engine hooks.** The dawn gate becomes the first `turnEndChecks` declaration on a `BuiltinSystem` (Blood & Bone's "night-ended"), run by one generic evaluator, so a new system can add its own without touching `generation.ts`. Next candidates, later: which system tools a system offers, and a named coded roll in place of the hard-coded `action_roll`. Design revised after Codex's review: `docs/dawn-gate-design.md`. |
| 184 | The revised design (`docs/dawn-gate-design.md`: system turn-end checks, Blood & Bone's "night-ended" the first) | **"Build it."** |
| 185 | The author, after playing Grave Watcher on the APK (a screenshot and the Debug Logs): "Not a fan on how much the ai flags output because that use of you and describing the player actions is completely okay for a DM." | **The Observer's player-agency judge allows second-person narration of the character carrying out what the player declared**, and the ordinary steps it implies; it flags only new meaningful dialogue, a significant choice the player didn't make, or a decided feeling. The logs also showed a bug behind most of the flags: a typed or picked action reaches `generateStoryTurn` as "" (it is already in the story), so the Observer, the Memory Keeper and the Director Assistant were told "(none - opening scene)" every such turn; they now read the line from the story (`playerLineOf`). |
| 187 | The author: "Merge, let codex review our judge layer, and work on the caching." Codex's review (`docs/research/codex-judge-layer-review-2026-10-24.md`) found rewrites replacing read text, races, double mechanics and misfed judges. Asked: "How should the judge layer work by default?" | **"Flag only, no rewrites (Recommended)."** Nothing rewrites or rerolls a turn on its own; only the outcome-mismatch judge stays on, as a flag, once its input is fixed; the other five are off and can be turned on in Settings. Design: `docs/judge-layer-design.md`. |
| 188 | "What should I do with those bugs?" | **"Plan the fix, then build (Recommended)."** |
| 189 | The judge-layer design (`docs/judge-layer-design.md`, with §4's recommendation on the Thinking folds) | **"Approved judge."** Build it, in the design's slice order; hidden-note text in the player's view shows as "(hidden note)", the reasoning folds stay with `[[HIDDEN_LORE]]` text redacted. |
| 186 | The author asked whether Claude through OpenRouter caches like Anthropic's API; the Debug Logs showed it does within a turn and between quick turns, but a turn after a pause of more than five minutes rewrote the whole ~60k-token prefix (0 cached), and streamed turns reported 0 tokens. The author: "work on the caching". | **The breakpoints reused across turns (the system message and the end of history) carry `ttl: "1h"`**; the turn's own stay at five minutes (Anthropic: 1-hour writes 2x input, 5-minute 1.25x, reads 0.1x; 1-hour entries before 5-minute ones). **The stream now reads the usage chunk OpenRouter sends after the finish**, so streamed turns report tokens, cache hits and the billed cost. |
| 190 | The author: "having feedback tools inside of the app. So people can give feedback on the default systems or the game, experience, etc." Asked: "Where should feedback go?" | **"Your sync Worker (Recommended)."** A `/feedback` endpoint on the existing Cloudflare Worker, in its KV; no accounts, private. Design: `docs/feedback-design.md`. |
| 191 | "What should a feedback submission include?" | **"Text + optional turn (Recommended)."** Rating, words, what it is about, app version and platform; attaching the turn is an unticked checkbox; never keys or other stories. |
| 192 | "Where should players be able to give feedback?" | **All four:** on a turn, on a system or starter, in the menu / Settings, and after a session. |
| 193 | "How do you want to read it?" | **"A private page (Recommended)."** Behind a secret the author keeps. |
| 194 | The revised feedback design (`docs/feedback-design.md`, after Codex's review) moved storage from the Worker's KV to Cloudflare D1, cut the contact field and made the turn attachment an allowlist the player previews. | **"Build it."** The revised design is approved as written, D1 included; it revises decision 190's "in its KV". |

### Session zero stopping between steps (2026-10-25)

The author, with a screenshot and the GM context of a quick Blood & Bone setup: "It just keeps stopping after every set up step. It should go on or ask the player something like 'Now it's time for your character, anything you want to tell me before?'" The context showed each setup turn doing real work (questions, notes read, creation prompts rolled), then a round with no words and no tool call, twice re-prompted, ending on "(Let's finish setting up first: next is the character sheet.)"; a later round's `create_note` for the plan was cut off at the token limit.

| # | question | decision |
|---|---|---|
| 195 | "When the GM goes quiet between setup steps, what should the player see instead of the dead-end '(Let's finish setting up first…)' line?" | **"A hand-back question (Recommended)."** The engine line names the next step and gives the floor back: "Next up: your character sheet. Anything you want me to know before I write it? Or just say go on." Any reply continues setup. Rejected: re-prompting until the step is done; both. |
| 196 | "How should a round cut off at the output limit (nothing left to write) be handled?" | **"Retry with a bigger cap (Recommended)."** A GM round with finish reason `length`, no visible words and no tool call whose arguments finished is asked again once per turn at double the cap (up to the model's maximum), which then holds for the rest of the turn. It does not count against the setup gate's re-prompts or the round limit, and applies to every turn. Rejected: a bigger cap in session zero only; lower effort in session zero. |

### Starters that welcome you in (2026-10-25)

The author: "I'm also not a fan of the default adventures. They just throw you in the middle of the game without the GM giving you an introduction and proper joining to the game. Especially the Grave Watcher adventure should start with us arriving for our first day." The first thing a starter showed was its authored opening, mid-crisis (a green light in the graves, a ghost at the desk, a tunnel nest), before setup; the GM then continued from it.

| # | question | decision |
|---|---|---|
| 197 | "When should a starter's authored opening appear?" | **"After setup (Recommended)."** The first screen is a welcome: what the adventure is, who you'll be, and the setup choice. After start_game the GM gives a briefing, then plays the authored opening as the first scene. Applies to every adventure, not only the starters. Rejected: first, as now, rewritten calm. |
| 198 | "Which starters get a new arrival opening?" | **"All three (Recommended)."** Grave Watcher, The Last Resort and The Hollow Hour each start with arriving and being introduced; their "Running it" notes stop saying "open in motion", and the hook comes later in the first session. |
| 199 | "What should Grave Watcher's first day look like?" | **"Town, then the tower (Recommended)."** Founders' Day morning in Hollins Ferry: the diner, the crew, the paperwork, the keys to Tower Nine; the climb at dusk for the first watch. The green light in the Old Lot ends the first night instead of opening it. Rejected: straight to the tower. |
| 200 | "How should I go about it?" | **"Build it now (Recommended)."** The answers are the plan; the new prose is read in the PR. |

### Interview — Fantastic Realms, the second default system (2026-10-25)

Design: [`fantastic-realms-design.md`](fantastic-realms-design.md).

| # | question | decision |
|---|---|---|
| 201 | The author: "next I want us to work on the second default system: Fantastic Realms. A fantasy ttrpg inspired by EZD6, stone stop, tiny rpg, mythic bastion land, and legends of the mist." | **The author's rules, as given.** Words are power: a hero's feats (words or phrases) each add a d6 when they apply, on top of a base d6. The GM sets a DC from 1 (easy, no roll) to 6 (almost impossible); each die is compared to it; 1 hit is a weak hit, 2 a hit, 3+ a strong hit, each hit beyond 3 one magnitude stronger. Burning a feat is a grand display that can't be used again until a rest. There is one kind of rest, whose condition the world sets. Initiative is 1d6 + 1 per feat that helps get the edge. |
| 202 | "When does a die count as a hit: when it equals or beats the DC, or only when it beats it?" | **"Equal or beat (Recommended)."** |
| 203 | "How do characters get hurt, and what does a miss (0 hits) cost?" | **"Hearts."** A small count lost on misses and weak hits; at 0 the hero is down. Rejected: statuses as words; both. |
| 204 | "How does burning a feat work?" | **"Auto-hit, die still rolls (Recommended)."** |
| 205 | "Do enemies and other characters roll?" | **"Only players roll (Recommended)."** A foe is a DC and words; it hurts the hero through misses and weak hits. |
| 206 | "How many hearts does a starting hero have, and what happens at 0?" | **"3, then 'down' (Recommended)."** At 0 the hero is out of the scene and the GM picks a cost; death only when the tone and stated stakes say so. A rest heals all hearts. |
| 207 | "What does a starting hero have?" | **"4 feats (Recommended)."** A one-line concept and four feats. |
| 208 | "How do heroes grow?" → "XP level multiplied by 1000"; asked to confirm the curve and the source | **XP, per level:** going from level N to N+1 costs (N+1) × 1,000 XP and the counter resets ("Yes, per level"). **"Treasures and enemies have xp they give for gathering or defeating. Quests too."** |
| 209 | "What does a new level give?" | **"A new feat (Recommended)."** |
| 210 | "What should the first release hold?" | **"Rules + a world + 1 starter (Recommended)."** |
| 211 | "What should the first world be like?" | **"Many realms, many rests (Recommended)."** A crossroads of realms with different rest rules: a bright heroic realm, a folk frontier, a grim realm. |
| 212 | The design's open points, as questions. "How does a foe's initiative work, since foes don't roll?" | **"DC + edge words (Recommended)."** |
| 213 | "Is this XP scale right? Foes give DC × 50 (mook), × 200 (champion), × 1,000 (legend); treasure about its worth in gold; a finished quest 500–2,000." | **"Yes (Recommended)."** |
| 214 | "Do levels ever raise a hero's maximum hearts?" | **"Every 3rd level."** Levels 3, 6, 9… also give +1 maximum heart. Rejected: never; a feat that is a heart. |
| 215 | "Should the system's description name its inspirations?" | **"Yes, 'inspired by' (Recommended)."** |
| 216 | After Codex's review of the design ([`research/codex-fantastic-realms-review-2026-10-25.md`](research/codex-fantastic-realms-review-2026-10-25.md)): "How much damage does each result do to a foe, and what does a hero lose on a miss or weak hit?" | **"1 / 1 / 2 / +1 (Recommended)."** To a foe: weak hit 1 (plus a cost to the hero), hit 1, strong 2, +1 per magnitude. To the hero: a miss costs 1 heart (2 against a harm word); a weak hit costs 1 only when the GM picks harm as its cost. |
| 217 | "When a foe acts first in initiative, what happens, given that foes never roll?" | **"Threat, then you answer (Recommended)."** The foe makes its move and the heroes it targets roll to answer it against its DC. Rejected: a free hit. |
| 218 | "When the party earns XP (a foe, a treasure, a quest), who gets it?" | **"Everyone, in full (Recommended)."** Rejected: split evenly; to who earned it. |
| 219 | The design revised after Codex's review (`docs/fantastic-realms-design.md`) | **"Build it."** The design is approved; the implementation plan is [`fantastic-realms-plan.md`](fantastic-realms-plan.md). |

### The judges, back on (2026-10-25)

The author: "Okay why did we turn the judges off? They were very useful for not much cost." Decision 187 had made the layer flag-only and switched five of the six judges off, after Codex found rewrites replacing read text, races and double mechanics; those bugs were fixed by the judge-layer build (decisions 188–189). Decisions 201–219 are the Fantastic Realms interview, on its own branch.

| # | question | decision |
|---|---|---|
| 220 | "Which judges should be on by default?" | **"All on, prose judges rewrite."** All six judges run every turn; the three prose judges (length, agency, outcome) rewrite a flagged turn automatically, the other three flag. Settings version 3 resets stored settings to these defaults once. Revises decision 187. Rejected: all on, flag only; pick per judge. |
| 221 | The author, unprompted: "Also rewrites happen only when judging gets apperent enough. So when rewrite is possible, it should hold the output back until the judging is done and rewrite if necessary." | **A turn's text is held while a rewrite is possible.** When a rewriting judge is on, nothing streams, is read aloud or reaches guests until the judges that could rewrite this turn have run; the final text is released once, with "Writing…", "Checking the turn…" and "Revising…" shown meanwhile. The background judges only flag: no rewrite ever replaces text the player has seen. |
| 237 | An engine review found that, with the text held, the agency judge could only rewrite when another judge made the turn blocking. "With the text now held until it's checked, the agency judge … can only rewrite if it runs before release on every turn with a player line. … What should it do?" | **"Check before release (Recommended)."** Every turn with a player line runs the agency judge before the text appears, so it can rewrite: about one cheap call and a second of wait per turn. |
| 240 | "With the text held, when the GM writes a bit of scene and then pauses to ask you something (a question, a roll, the dice tray), the question now pops up with none of that scene on screen. … What should happen?" | **"Release up to the pause (Recommended)."** At a pause the text written so far is checked and shown before the question appears; it can no longer be rewritten afterwards; the text after the pause is held and checked as usual. |
### Interview — campaigns and the judge layer, grown (2026-10-25)

The author: "I also want us to look in depth at campaign setup, the whole format and parts, and also on the judge layer. And I want us to improve and grow those 2 features because they're major. Ai needs judging and help, and it also needs a nice structure with a lot of options. We should look at how other people make AI supervise itself and how the best TTRPG adventures are designed and used." Research: [`research/ai-supervision-2026-10-25.md`](research/ai-supervision-2026-10-25.md), [`research/adventure-design-2026-10-25.md`](research/adventure-design-2026-10-25.md), [`research/campaign-and-judges-audit-2026-10-25.md`](research/campaign-and-judges-audit-2026-10-25.md). Decisions 201–219 (Fantastic Realms) and 220–221 (the judges back on, output held) are on their own branches.

| # | question | decision |
|---|---|---|
| 222 | "What should a campaign be built from?" | **"Situations + styles (Recommended)."** A campaign is a menu of parts (pitch and tone, a starting situation, factions with goals, fronts with clocks, NPCs with wants and secrets, secrets and clues, locations, tables, end states); a style (sandbox, adventure path, mystery, horror, episodic, slice of life, solo) picks which parts it uses; beats become optional, for the adventure-path style. Rejected: keep the beat spine and add parts; a few fixed templates. |
| 223 | "How should clocks and fronts move?" | **"Engine ticks them (Recommended)."** Clocks are engine objects linked to their front, ticked by the engine on the triggers the campaign sets (a miss, a scene, a rest, time); the engine says when a portent or doom lands; the GM can tick them too. Replaces the timers that never tick. |
| 224 | "Who should be able to write the campaign structure?" | **The GM in session zero, the Game Designer, and the starters** (which ship complete campaigns). Not chosen: the player editing it. |
| 225 | "Should session zero include safety tools?" | **"Lines and veils (Recommended)."** Asked in session zero, stored in the campaign, carried to the GM every turn, checked by a judge. |
| 226 | "Which direction for the judge layer?" | **"Facts first, then judges (Recommended)."** Deterministic checks on engine facts first, cheap LLM judges with rubrics and examples for what code cannot see, and a rewrite always handed the specific facts it must match. |
| 227 | "Which new checks should the judge layer grow?" | **All four:** world consistency, secret leaks, rules adherence, pacing and spotlight. |
| 228 | "Should judges use more than one model family?" | **"One cheap judge, panel for rewrites (Recommended)."** Haiku judges every turn; before a rewrite, a second judge from another family must agree. |
| 229 | "How do we know a judge actually helps?" | **"Labelled turn set (Recommended)."** A set of real turns from the author's Debug Logs and story exports, each labelled good or with the problem it has, and a runner that scores every judge on it; each run costs model calls on the author's key, so it waits for the author's go. (The author first clicked "Player signals only" by accident and asked again: "Last question I clicked by accident".) |
| 230 | The designs' open questions. "Should clocks be able to tick on in-world time (days passing)?" | **"Not yet (Recommended)."** Triggers are a miss, a scene, a rest, a session or by hand; an in-world calendar is a later design. |
| 231 | "Should the player see the campaign's clocks?" | **"Per clock, style default (Recommended)."** Sandbox, adventure path and slice of life show them; mystery and horror hide them. |
| 232 | "Should Blood & Bone's Heat, Unrest and Vacancy stay meters or become clocks?" | **"Stay meters (Recommended)."** |
| 233 | "Where should the labelled turn set live?" | **"Only turns you approve (Recommended)."** The runner and format in the repository; a turn goes in only once the author approves it for publishing; the rest in a private folder outside the repository. |
| 234 | "Which model family confirms a rewrite before it happens?" | **"Let the player pick."** A picker under Settings → AI → Advanced, GLM 5.3 by default. |
| 235 | "Should a pacing note ever reach the player?" | **"GM only (Recommended)."** |
| 236 | "What next?" | **"Codex review, then plans (Recommended)."** |
| 238 | The author shared a friend's agentic-coding material (a turn-completion auditor, a markdown auditor, and a prompt-engineering note by Wes Brown): "Maybe we can use some of this?" Asked which practices to adopt. | **"Judge prompts by his rules (Recommended)."** The judge, re-ask and rewrite prompts follow the note: decision chains instead of fine/violation lists, facts before the verdict in named fields, minimal-pair examples, a fix plan before every rewrite, re-asks that carry the exact repair, the labelled set run many times per case with counts reported (`judge-layer-v2-design.md` §4). |
| 239 | (same question) | **"GM prompt audit."** Audit the GM's own system prompt, the session-zero block, the tool descriptions and the gate messages against the same rules, as its own design. Not chosen: the turn-completion hook; the trimmed markdown auditor. |
| 241 | The three designs (the campaign format, the judge layer v2, the GM's prompts) | **"All three and then let codex review them."** All three approved; the implementation plans are [`campaign-format-plan.md`](campaign-format-plan.md), [`judge-layer-v2-plan.md`](judge-layer-v2-plan.md) and [`gm-prompt-plan.md`](gm-prompt-plan.md), reviewed by Codex before building. |
| 242 | Campaign slice 1 measured the new `campaign` tool at 135 tokens (bare schema), taking the default tool list to 10,034 against its 10,000 budget. "The new campaign tool puts the GM's tool list 34 tokens over its 10,000-token budget … What should we do?" | **"Trim other tools (Recommended)."** `manage_timer`'s description was cut and its unused `auto_advance` parameter dropped; the default list is 9,977 tokens with the campaign tool, under the one budget, with no separate allowance. Rejected: a 150-token allowance; offering the tool only to campaign stories. |

