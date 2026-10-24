# The judge layer: flag only, and the bugs under it

Status: **design and plan, waiting for the author's approval.** Decisions
187–188. Source: Codex's review of the judge layer
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
