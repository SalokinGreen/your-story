# The judge layer: flag only, and the bugs under it

> **Update 2026-10-25 (decisions 220–221).** The flag-only defaults of §2 were
> revised: every judge is on, the three prose judges rewrite, settings version
> 3. A rewrite never replaces text the player has seen: while a judge may
> rewrite, the turn is **held** (`holdLiveText`, `heldTurnOutput.ts`) and
> released once after the judging, with the phases "Writing…", "Checking the
> turn…" and "Revising…" on the work line. The background wave no longer
> rewrites, so §3.1's rewrite patch (`applyBackgroundRewrite`) is gone; flags,
> memory, director and progress deltas still land by id.
>
> **Follow-up fixes (decisions 237 and 240, same day).** The blocking pass runs
> only the judges that are enabled and rewriting; the background wave runs the
> rest once (`splitObserverSettings`). The agency gap is closed (237, "Check
> before release"): `player_agency` is plausible on every turn with a player
> line while enabled and rewriting, so it can rewrite, for about one cheap call
> and a second of wait per turn. At a pause on the player (a question, a roll,
> the dice tray, the setup card) the prose so far is checked, rewritten if a
> major flag lands, and shown before the pause appears (240, "Release up to the
> pause"); it cannot be rewritten afterwards, and the text after the pause is
> held and checked as usual (a tier retry is refused once text is on screen).
> A failed choices call no longer discards a finished narration, an empty held
> turn appends nothing, and guests are no longer sent the previous turn's text
> as "being written" during the hold (`liveRelayText.ts`).

Status: **approved (decision 189) and built on 2026-10-24; see "Decisions made
during implementation" at the bottom.** Decisions 187–188. Source: Codex's review of the judge layer
(`docs/research/codex-judge-layer-review-2026-10-24.md`), after the author's
Grave Watcher session on the APK, where the player-agency judge kept
rewriting ordinary narration the player had already read (decision 185).

## 1. What the author decided

- **187, flag only, no rewrites.** By default nothing rewrites or rerolls a
  turn on its own. Only the outcome-mismatch judge stays on, as a flag in the
  turn's details, once its input is fixed (§3.6). The other five judges are
  off, and Settings can turn each back on.
- **188, plan the bug fixes, then build.**

## 2. The new defaults

`DEFAULT_OBSERVER_SETTINGS` (`app/misc/observer.ts`):

| Judge | enabled | triggersReset | sensitivity |
|---|---|---|---|
| response_length | false | false | 5 |
| player_agency | false | false | 3 |
| outcome_narration_mismatch | **true** | false | 2 |
| missing_oracle_or_table | false | false | 5 |
| missing_scene_increment | false | false | 5 |
| tier_escalation_missed | false | false | 5 |

- **No automatic correction by default.** With every `triggersReset` false,
  `canObserverTriggerReset` is false: no blocking judge, no reset, no
  background rewrite, no speculative shortening. A player who turns a reset
  on in Settings gets today's behaviour, with the fixes in §3.
- **The speculative shortened rewrite** (`generation.ts` ~1257) runs only
  when `response_length` is enabled with `triggersReset`, never otherwise.
- **Saved settings.** A stored Observer config overrides the defaults
  (`layerSettings.ts`), so an existing player would keep today's
  rewrite-everything settings. **One-time reset**: a settings version
  (`observerSettingsVersion: 2`) is stored; a config without it is replaced by
  the new defaults once, with a Debug Logs line. A player's later choices are
  kept.
- **Flags stay visible** where they are now (the turn's details), and the
  free deterministic checks (`consistencyCheck.ts`, pacing feedback) stay as
  Debug Logs and turn details, with no routine toasts (§3.10).

## 3. The bug fixes

Each is a Codex finding (its numbers in brackets). Where a fix only matters
when a player turns a rewrite back on, it is still fixed: the setting exists.

1. **[1] A background rewrite lands on the turn it judged, or nowhere.** The
   rewrite carries the part's id and a hash of its content when judged; it is
   applied through `patchStoryData` (the picture queue's pattern, against the
   *current* story) only when a part with that id still exists with that same
   content. Never a captured whole-story object (`page.tsx` ~334, 368, 386).
2. **[2] The turn stays locked while a blocking judge decides.** The page's
   turn-running lock is released only by the outer `onComplete`, not by the
   choices or the story stage (`page.tsx` ~2546, 2749, 2801). Read-aloud
   starts after the judge too, when a blocking judge is on.
3. **[3] A reword never re-runs mechanics.** The reword path (`page.tsx`
   ~4296) passes `allowMechanicalRetry: false`; on that path an Observer reset
   rewrites prose only, never re-enters the full-turn retry (`generation.ts`
   ~963), so a meter change or a spent resource cannot happen twice.
4. **[4] A missing tool is never "fixed" by words.** `missing_oracle_or_table`,
   `missing_scene_increment` and `tier_escalation_missed` are flag-only by
   type: `rewriteFlaggedNarration` is never called for them and they are never
   marked corrected. Their `triggersReset` toggle is removed from Settings.
5. **[5] A rewrite is checked before it replaces anything.** Rejected, and the
   original kept, when the reply is truncated (`finish_reason` length), carries
   tool calls, is a refusal or meta reply, or is empty after the normal
   narration cleanup (`extractVisibleText`, the same strip the story stage
   uses).
6. **[6] The outcome judge gets typed verdicts.** It is given only real
   adjudications: `action_roll` and `progress_roll` with their outcome tier
   (strong hit / weak hit / miss), `record_challenge_result`, and a
   `calculate` only when its expression holds a comparison (`>=`, `<`, …) and
   evaluated, never a plain sum or an evaluation error. Each result is judged
   on its own line; the turn-wide "mixed results make everything minor" cap
   goes, so one success cannot excuse a reversed second roll.
7. **[7] A rewrite respects the choices setting.** No choices call when
   `skipChoices` (suggested choices off); and the background path re-checks
   the part id after awaiting choices, before writing them.
8. **[8] A judge that fails says nothing.** A failed or unparseable length
   justification is "unknown", not a major flag; no prose fallback ever
   rerolls the turn's dice. An `AbortError` (Stop) passes through the judges'
   catches.
9. **[9] Changing a setting cannot change the defaults.**
   `getObserverSettings` returns a fresh deep copy; the defaults object is
   frozen; Settings compares each value against that type's own default.
10. **[10, consistency] The deterministic consistency check** matches a name
    only in its own clause, and skips negated or past mentions ("Marcus never
    arrives", "Marcus is dead. Ada arrives"). Its findings go to the Debug
    Logs, no toast.
11. **[cost] Every side call is recorded**, including one cancelled before it
    answered (cost unknown, marked as such), so the turn cost never shows a
    billable call as free.

## 4. What the player sees

- **Published text never changes under the player by default** (§2). When a
  player opts into automatic rewriting, the turn's details say which judge
  rewrote it and keep the original one tap away (today's "Undo revision", now
  attached to that turn, not only the latest).
- **The "Thinking" folds and GM-only tool results.** Codex found that
  `read_notes` results for hidden or secret notes, and the model's raw
  reasoning, are expandable in the turn's work line, so a curious player can
  read the GM's secrets. **Recommended**: a `read_notes` result in the
  player's view shows the note titles only, with the hidden or secret text
  replaced by "(hidden note)"; the raw reasoning folds stay (the author uses
  them), with any text inside `[[HIDDEN_LORE]]` markers redacted the same way.
  The full text stays in the Debug Logs and the context viewer.
- **Settings** (`ArchitectureSettingsTab.tsx`): each judge reads Off / Flag
  (and, for the three prose judges, "Rewrite automatically: changes text you
  may already have read"); the cost line says which judges make a call; the
  response-length judge is no longer labelled free.

## 5. Files

- `app/misc/observer.ts`: the defaults (§2), typed outcome verdicts (§3.6),
  rewrite validation (§3.5), flag-only types (§3.4), judge failure and abort
  (§3.8).
- `app/misc/layerSettings.ts`: fresh copies, the frozen default, the one-time
  settings version (§2, §3.9).
- `app/misc/generation.ts`: the background rewrite's part id and content
  hash, `allowMechanicalRetry`, the speculative rewrite gate, `skipChoices` in
  rewrites, abort pass-through.
- `app/story/page.tsx`: the turn lock (§3.2), the reword flag (§3.3), the
  background patch through `patchStoryData` (§3.1), "Undo revision" per turn.
- `app/misc/consistencyCheck.ts` (§3.10), `app/misc/sideModelCall.ts`
  (§3.11).
- `app/misc/turnTimeline.ts` and `app/story/StoryTurn.tsx`: the redaction in
  the player's view (§4).
- `app/components/ArchitectureSettingsTab.tsx`: Off / Flag / Rewrite, the
  cost line (§4).
- Tests beside each; `CLAUDE.md` (the Observer paragraph);
  `docs/pending_tests.md` (a live turn: no rewrite, the outcome flag on a
  reversed roll).

## 6. Slices

1. Defaults, the settings copy and version, the speculative gate (§2, §3.9).
2. Typed outcome verdicts (§3.6).
3. Rewrite safety: validation, flag-only types, failure and abort, choices
   (§3.4, §3.5, §3.7, §3.8).
4. The page: the lock, the reword flag, the background patch, Undo per turn
   (§3.1–3.3).
5. Redaction in the player's view and Settings (§4); consistency check and
   cost recording (§3.10, §3.11).

One PR; the engine-review agent before merge; the browser preview for
Settings and the work line; the desktop app for one turn of each starter
(no rewrite appears; a hidden note read shows "(hidden note)").

## 7. Not in this

- Codex's other suggestions that would grow the layer (a "Suggested fix"
  preview, per-check prior-consent context for player agency, a rewritten
  `missing_oracle_or_table`): not built; the judges they would improve are now
  off by default.
- The pre-turn cost estimate's double counting (`turnCostEstimate.ts`):
  noted, not fixed here.

## Decisions made during implementation

2026-10-24, the build of slices 1-5 (decisions 187-189). Where the code
forced a different shape from the design, or the design left a call open:

1. **`tier_escalation_missed` keeps its heavier-tier full-turn retry, but only
   as a code path.** §3.4 makes it flag-only by type ("never rewritten, never
   marked corrected") and removes the toggle from Settings, and §3.8 removes
   every prose-triggered reroll. Read literally those delete the one retry the
   tier judge was built for. The code keeps it, unreachable from Settings and
   from the defaults: it fires only when a config sets the tier flag's
   `triggersReset` directly, and never on the reword path
   (`allowMechanicalRetry: false`). The two tool-usage gaps are stricter:
   `settingsFor` reports them unable to reset whatever a stored config says
   (`FLAG_ONLY_FLAG_TYPES`). The tier judge's flag still never becomes
   "corrected" (`rewriteFlaggedNarration` returns null for it). If the author
   wants the retry deleted outright, it is the `preTurnSnapshot` branch in
   `generateStoryTurn` plus `observerRetryTier`, and
   `tests/generation.observerRetry.test.ts` with it.
2. **A late result is a patch, in a new module `app/misc/backgroundPatch.ts`.**
   The design names `patchStoryData` (the picture queue's pattern); the page
   already builds that host inline in `buildImageJobDeps`, so it is extracted
   as `buildPatchHost()` and shared (`applyStoryPatch`). `generateStoryTurn`
   no longer writes the background rewrite or the flags into its own
   `storyData`; it calls `onBackgroundObserverRewrite(patch)`,
   `onBackgroundObserverFlags(flags, partId)` and
   `onBackgroundLayersUpdate(delta)`. The memory, director and progress agents
   still write to the turn's own object (headless callers and the next turn's
   `lastAssistantPart` read it there); the page gets only the delta, and
   memory is appended by entry identity so a story whose array already holds
   the push is not doubled.
3. **The rewrite carries part id plus a content hash**, using `hashNotes`
   (campaignPlan.ts). A rewrite whose part still exists but holds different
   text (the player edited it) is dropped, and logged by the page.
4. **The outcome judge's prompt was rewritten around tiers**, not just fed new
   inputs: the old "judge all results together, expect mixed" paragraph and
   the "mixed" note are gone (they belonged to the turn-wide cap). A bare
   `calculate` comparison can still be one part of a multi-comparison check;
   the prompt tells the judge to read the adventure's rules note for that. The
   flag's severity is always "major" now (it is only acted on if a player opts
   into rewriting the outcome judge).
5. **A check function called with no settings runs** (`CHECK_RUNS_BALANCED`:
   on, sensitivity 5). Whether a check runs at all is decided before it is
   called, by `settingsFor` in `runObserver`; its own default parameter used
   to consult `DEFAULT_OBSERVER_SETTINGS` a second time, which would have made
   every direct call a no-op under the new defaults.
6. **The settings version is stored inside the synced value** as
   `observerSettingsVersion: 2` in `observerCheckSettings`, not as a second key
   (the sync allowlist is per key, and the version has to travel with the
   settings). An older build reads only the per-type keys and, if it writes the
   config back, drops the version, so the next read on a newer device resets
   again. Accepted: it re-applies the safe defaults.
7. **`GenerateSuccess` gained `finishReason`** (`providerCall.ts`,
   non-streaming only) so a rewrite cut off at the token limit can be
   rejected (§3.5). A reply from a path that does not report it is treated as
   complete.
8. **The turn lock is `turnInFlight`**, set by `generateTrackedTurn` and
   cleared in its `finally`, plus a ref for the handlers' guards
   (`handleCustomInput`, `handleChoiceWithAction`, `handleRetry`,
   `handleUndo`, the setup-style button). The screen reads
   `effectiveLoadingStage(loadingStage, turnInFlight)`, so a turn in flight with
   no stage reads as the story stage. `checkBothComplete` no longer clears
   `loadingStage` (§3.2). Read-aloud is held for the outer `onComplete` only when
   `canObserverTriggerReset` is true for the stored settings (it cannot know
   per turn whether the judge will block, so it holds whenever one could).
9. **The redaction is a render-time and build-time pass**
   (`redactForPlayer`): tool results at block construction (live and saved),
   reasoning text at render. A note of type `secret` read without a hidden
   visibility carries no marker, so it is redacted by its `(Secret)` header.
   Raw reasoning that paraphrases a secret without a marker cannot be caught;
   the folds stay, as the design says.
10. **The consistency toast is removed from the two flows that had it**
    (custom input and the reword path); the warnings stay on the part and in the
    Debug Logs (`generation.ts` already logged them).
11. **Cost recording** adds `recordUnansweredSideCall`: a call cancelled
    before it answered, or answered with an unreadable body, is an entry with no
    tokens, flagged `unpriced` and labelled "cost unknown", so the turn's total
    reads as a floor. A provider error response (non-2xx) is not recorded: the
    provider did not bill it.
12. **Not done, on purpose:** Codex finding 10's correction priority (length
    before outcome) is moot with at most one rewritable finding acting and is
    not reordered; `turnCostEstimate.ts` is untouched (§7); the Settings
    "Rewrite automatically" copy and the cost line were verified by the
    suite's pure helpers (`observerModeOf`, `countJudgeCalls`) only, not by a
    browser (no preview in the build session; `pending_tests.md` has the
    check).

### 2026-10-24: fixes from the engine review

1. **Late patch on the wrong story.** `page.tsx` keeps `currentStoryIdRef`;
   `buildPatchHost`'s `isMounted` is now "mounted and still showing the story
   the closure captured", so a patch for a story the player left goes through
   `patchStored` (the picture queue gets the same host). A turn that started on
   a not-yet-saved story (captured id null) is treated as the story on screen.
2. **`applyBackgroundLayersDelta` skips the whole delta** when its part id is
   gone, memory and progress counter included. The old test was rewritten.
3. **Patches during a turn are queued, not written into the live object.**
   `PatchHost.defer` and `createPatchQueue()` (`imagePatcher.ts`); only the
   background wave's host defers (pictures keep the in-place path). The queue
   is flushed from `generateTrackedTurn`'s `finally`, after the turn's final
   save was awaited, on a `setTimeout(0)` so the turn's commit has reached
   `storyDataRef`. A queued patch keeps the host (story id) it arrived with.
4. **`search_notes` and secret notes.** Rather than thread the lore through the
   timeline and the UI, the executors wrap a hidden or secret note's excerpt in
   the same `[[HIDDEN_LORE]]` markers `read_notes` uses (`noteVisibility.ts`
   is the one rule), so `redactForPlayer` blanks it. The GM still sees the text.
5. **Secret `read_notes` bodies** are now wrapped in the markers too, so the
   redaction ends at the marker. `SECRET_NOTE_SECTION` stays only for results
   saved before this change.
6. **Director spotlight:** `snapshotValue` / `valueChanged` (value compare).
7. **Online batch:** `startBatchedTurn` checks `turnInFlightRef` before
   clearing the batch, with the toast "A turn is still finishing".
8. **Flag toast** only when `applyBackgroundFlags` changes the story on screen.

Tests for the page-level wiring (1, 7, 8) are source checks: the page cannot be
mounted in Vitest. A browser check of a Save-as jump during a background wave
is owed.

## Decisions made during implementation (2026-10-25, held-turn fixes)

- **Pause release mirrors the unheld flow.** The prose released at a pause goes
  out through `onGMContent` and `onLiveNarrationUpdate` (what a round's prose
  uses without the hold), not through `onStoryContent`: the page has no part for
  the turn until the story callbacks, exactly as before 221. The finished turn's
  text then begins with the released prose (it is kept as the first entry of the
  GM's accumulation, and both paths share `polishGMProse`), and
  `held.release(text, pause.text)` adds only the tail to the live timeline.
- **A pause rewrite does not reconcile the GM's saved history.** Its
  `gmConversation` still holds the first draft; "Undo revision" restores the
  draft (`undoPauseRewrites`). The rewrite there runs without the turn's
  conversation (`conversationMessages`), on the standalone rewrite prompt,
  because the conversation does not exist yet mid-turn.
- **The reset budget is shared.** A pause rewrite spends the turn's one
  `MAX_OBSERVER_RESETS`, so the end-of-turn pass will not rewrite again.
- **No heavier-tier retry once anything is on screen.** A
  `tier_escalation_missed` reset after a pause release keeps the turn with its
  flag.
- **If the finished text does not begin with the released prose** (a story
  stage that rewrote it), the end-of-turn pass judges nothing more and logs it.
