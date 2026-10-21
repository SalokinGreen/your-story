---
name: verify
description: Run the Your Story verification suite — the Vitest suite, the typecheck, lint, the web and standalone builds, and on this machine the Tauri desktop build — and report the evidence. Use after any code change, before any commit or merge, or when asked whether the app still passes.
---

# Verifying Your Story

Everything the engine does is checkable from a terminal. Whether the
*product* works — the native app reaching a provider, a screen laid out
right, a model doing something sensible with the prompt — mostly is not.
Keeping those two facts apart is the whole discipline here.

## State of play — read this first

**There is no CI on pull requests.** GitHub's only checks are Vercel's
preview deploys, which prove a deploy and nothing else. The suite below is
run by the session that made the change, and nobody else runs it.

| check | command | what it proves | where |
|---|---|---|---|
| the suite | `npx vitest run` | ~110 files, ~1,610 tests (2026-10-21), ~20 s. The engine, the prompt builders, the executors, the oracles, sync, multiplayer, OCR helpers | anywhere |
| one area | `npx vitest run <substring>` (e.g. `gmTools`, `primaMateria`) | the files whose names match | anywhere |
| no raw `/api` fetch | part of the suite: `tests/noRawApiFetch.test.ts` | no client code calls `fetch("/api/…")` outside the `*Fetch.ts` wrappers, so the native build can reach providers. It reads every file under `app/`, so it is the slowest test; it timed out once under load on 2026-10-21 and passed on re-run | anywhere |
| side calls forward every key | part of the suite: `tests/sideModelCall.test.ts`, `tests/generation.sideCallKeys.test.ts` | a turn with only a Mistral key still runs compaction and reflection | anywhere |
| typecheck | `npx tsc --noEmit` | the types, ~30 s. There is no `typecheck` script | anywhere |
| lint | `npx eslint .` or `npx eslint <files>` | **debt, not a gate**: 587 problems (262 errors, 325 warnings) on 2026-10-20. No ratchet yet — check that the files you touched gain nothing new | anywhere |
| web build | `npm run build` | the Next build with API routes, ~2 min. Needs no env vars | anywhere |
| standalone build | `node scripts/build-standalone.mjs` | the static export to `out/` that Tauri and Capacitor package. **The build that counts** (decision 1). Use the script rather than `NEXT_PUBLIC_STANDALONE=true npm run build`: that prefix is POSIX-only and fails under `cmd.exe` (which Tauri's `beforeBuildCommand` uses) and PowerShell | anywhere |
| desktop build | `RUSTUP_TOOLCHAIN=1.99.1 npx tauri build` | the Windows MSI and NSIS installers under `src-tauri/target/release/bundle/`, ~5 min warm, ~10 min cold. Run when anything under `src-tauri/`, a Tauri plugin or `package.json`'s Tauri deps changes. `Cargo.toml` needs rustc ≥ 1.90; this machine's default `stable` is 1.86, so name the newer toolchain | this machine only |
| desktop app starts | launch `src-tauri/target/release/app.exe`, wait 10 s, check it is still running with the window title "Your Story", then close it | the shell and its plugins initialise. Not that a turn works | this machine only |
| the screens | the browser preview (`.claude/launch.json`, `your-story-dev`) and the preview tools | a UI change renders and behaves. Screenshot it before the summary | this machine only |
| Android / iOS | `.github/workflows/build-apps.yml` (manual) | never run. Uses the author's Actions minutes, so it **waits for the author's go**. This machine has no Android SDK and no Mac | GitHub only |

## The order matters, and step 0 is the one that gets skipped

**Capture the baseline BEFORE editing anything.** After the fact is too
late — there is nothing to compare against, and "it still passes" is a much
weaker claim than "the same 1,610 tests pass, plus the three new ones."

```bash
npx vitest run 2>&1 | grep -E "Test Files|Tests " > "$SCRATCH/before.txt"
npx eslint <files you will touch> 2>&1 | tail -1 >> "$SCRATCH/before.txt"
```

Use the session's scratchpad directory for `$SCRATCH`, not `/tmp`.

## The suite

```bash
# A fresh worktree has no node_modules. 2–6 minutes; run it in the
# background. Its postinstall patches the dice library.
npm ci

npx vitest run
npx tsc --noEmit
npx eslint <changed files>

# When the change can reach the build: the web one and the one that counts.
npm run build
node scripts/build-standalone.mjs

# When native configuration moves (src-tauri/, Tauri plugins, capabilities).
RUSTUP_TOOLCHAIN=1.99.1 npx tauri build
```

**`tauri dev` does not test the native path.** Its `beforeDevCommand` is
plain `npm run dev`, a non-standalone build talking to the dev server's
`/api/*`. Only `tauri build` exercises what ships.

**Runs against a live model wait for the author's go — flag them, don't run
them.** The keys are the author's own and every call costs money. This
covers playing a turn with a real key, an eval against a provider, and any
long campaign run. Name the run in the summary ("this touches the GM loop —
a played session against a real model would normally go here") and let the
author decide. The suite above still runs as normal.

## Reading the result

- Vitest's summary is two lines: `Test Files  N passed (N)` and
  `Tests  N passed (N)`. Check those, not the scroll above them. A failure
  shows `FAIL  tests/<file> > <describe> > <test>` and a
  `Failed Tests` block.
- **A failure in `noRawApiFetch` while the machine is busy:** re-run that
  file alone (`npx vitest run noRawApiFetch`) before believing it, then
  re-run the whole suite. Never dismiss a failure without re-running it.
- `tsc` prints nothing when clean. Any output is an error.
- `next build` prints `✓ Compiled successfully` and the page count;
  the standalone build should also leave `out/story.html` and
  `out/creator.html`.
- `tauri build` ends with `Finished 2 bundles at:` and the two installer
  paths.

## Things that touch the working tree on their own

- **`npm ci`'s postinstall rewrites the line endings** of
  `public/assets/themes/default/default.json` and `theme.config.json`.
- **`tauri build` can rewrite the line endings of `src-tauri/Cargo.toml`.**

Check that the diff is line endings only (`git diff --ignore-cr-at-eol`
prints nothing for the file), then `git checkout -- <file>`. Don't commit
them.

## Two rules about honesty in the report

1. **Never claim something was tested when it was compiled.** `next build`
   succeeding, and even the whole suite passing, says nothing about whether
   the desktop app can reach a provider or a menu opens in the right place.
2. **Anything only observable on screen, in a native shell, on a device, or
   with a live key goes in
   [`docs/pending_tests.md`](../../../docs/pending_tests.md)** before
   finishing, and gets said out loud in the summary — *if* this session
   could not do it. Write each as a check a person performs, with the
   expected result and, where predictable, what the failure looks like.
   "Paste the code from openrouter.ai into the desktop app; the OpenRouter
   key should show as saved and a turn should reach OpenRouter" is a test.
   "Verify OAuth" is not. Group under a dated heading, newest at the top.

## Evidence, not assertions

Paste the actual summary lines, the actual failing test names, the actual
build tail. "The tests pass" is not a report.

## If `node` or `node_modules` is missing

In a cloud session the SessionStart hook runs `npm ci` once. If it did not
run, or a local worktree is fresh, run `npm ci` yourself (in the background;
it takes minutes) before anything above.
