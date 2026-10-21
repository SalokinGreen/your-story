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
