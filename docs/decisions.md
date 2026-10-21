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

### Interview four — party mode on the desktop (2026-10-21)

Numbers 10–20 belong to the Claude/GLM design (`claude/claude-gm-design`) and
the side-agents fix (PR #204); they land with those PRs.

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
| 29 | The S0 phone test had to wait | **Build S2 first, stop before S1** ("Build S2 meanwhile"): the pure-TypeScript protocol, host state machine, redaction boundary and turn-text extraction went ahead while the author had no phone to hand. Nothing in Rust, no UI and nothing that opens a port until S0 passes. |
