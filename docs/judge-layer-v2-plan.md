# The judge layer, version 2 — implementation plan

**Design:** [`judge-layer-v2-design.md`](judge-layer-v2-design.md), approved
("All three", decision 241). Decisions 226–229, 233–235, 237–238, 240.

## Before slice 1

This plan builds on top of:
- **The held output** (220–221, 237, 240), on master;
- **Fantastic Realms** (#252), on master;
- **Campaign slice 1**: the record supplies lines, veils, secrets and people.

Slices 1 and 2 run before campaign slice 3 can use the safety check. Take
the baseline on master after those merges.

## Slice 1 — rung 1 checks and the rung 2 re-ask

**The facts** (design §11.3), in a new `app/misc/judges/facts.ts`.
`collectTurnFacts(storyBefore, storyAfter, gmResults)` returns `Fact[]`. A
`Fact` is `{ id, source: {kind: "tool"|"record"|"sheet"|"npc", ref}, when:
"before"|"after", text }`. The ids are `f1…fn` per turn.

**Rung 1**, in a new `app/misc/judges/rung1.ts`, pure:
`runRung1(turn): Rung1Hit[]`. A `Rung1Hit` is `{ check, verified: boolean,
evidence: string, factIds, reask?: string }`.

| Check | What it compares | Re-asks? |
|---|---|---|
| Event contracts | `BuiltinSystem.eventContracts` (design §11.2) | Verified: yes |
| Dead or departed people | `consistencyCheck.ts`, generalised to the record's people | Flag only |
| Lines | Each line's `keywords` in the visible prose, case-insensitive, whole word | Re-ask with the line and the span (the narration is not final yet) |
| Secret phrases | Each unrevealed secret's `keyPhrases` | Flag; feeds the secret-leak judge |
| Pacing counters | Scenes since a clock moved; turns since each player was addressed (couch/party, by name in the prose); `findRepeatedPhrases` | A GM note next turn (decision 235) |

**Event contracts.** `BuiltinSystem.eventContracts?: EventContract[]`,
declared in `systems/types.ts`:
`{ id, when: {tool, resultType, require?: (result) => boolean}, expects: (turn) => ExpectResult, reask: (turn) => string }`.
- **Fantastic Realms** declares `foe-damage`:
  - `feat_roll` gains an optional `target`, the foe's name;
  - a hit tier with a `target` expects a Hearts change on that target's meter
    in the same turn, equal to `foeDamage(result)`;
  - its re-ask names the exact `manage_meter` call.
- **Blood & Bone** declares none in this slice.

**The re-ask:**
- **Where.** In `generation.ts`, after the GM's final round and before
  narration, beside the turn-end checks. It reuses that path's appended user
  message and `tool_choice: "auto"`.
- **How many.** One re-ask per turn in total, sharing `maxToolLoops`.
- **What it may do.** The re-ask round may call tools only; its prose replaces
  the final round's.
- **What it never does:** re-run dice already executed.
- **Logged,** with each hit, to the Debug Logs.

**Tests** (`tests/judges.rung1.test.ts`, `tests/generation.reask.test.ts`):
- each check's hit and miss, as minimal pairs;
- a burn on the current roll is not a violation;
- a clamped write is not a violation;
- one re-ask per turn;
- no dice re-run.

## Slice 2 — the combined judge call (rung 3)

**The judge prompts**, in a new `app/misc/judges/prompts.ts`, one rubric per
judge written to design §4 (decision 238):
- a decision chain;
- the facts as named fields first;
- a minimal pair of invented examples;
- the JSON keyed by judge.

**The judges:** length (justified?), agency (the shared chain constant, also
read by the GM prompt plan's slice 2), outcome, world consistency, secret
leak, lines and veils, and the oracle and tier gaps.

**The call.** `runCombinedJudges(turn, facts, settings)` in a new
`app/misc/judges/combined.ts`:
- it puts the judges whose preconditions hold into one `callSideModel` call
  (Haiku, the side-agent pin);
- it parses with `parseJudgeVerdicts` (design §11.5): a missing key or
  malformed JSON gives "unknown" and a Debug Logs line;
- it never truncates the facts; when there are too many it splits into two
  calls by judge group.

**Wiring into `observer.ts`:**
- `runObserver` calls the combined call. The old per-judge calls
  (`checkOutcomeMismatch`, `checkToolUsageGaps`, `checkTierEscalation`, the
  agency and length APIs) stay behind `observerSettings.combined === false`,
  for the labelled-set comparison.
- The blocking pass (220/221/237) runs only the rewriting judges' part of the
  combined call. The background wave runs the rest.

**Tests** (`tests/judges.combined.test.ts`):
- the prompt contains each rubric's chain and its pair;
- the facts come before the narration;
- parsing: good, missing key, malformed;
- the split call when the facts are large;
- each judge's precondition.

## Slice 3 — confirmation and the rewrite with facts

**Confirmation.** `confirmFinding(finding, facts, model)` in
`app/misc/judges/confirm.ts`:
- **The model** is the player's pick (decision 234):
  `layerSettings.ts` `getRewriteConfirmModel()`, GLM 5.3 by default, with a
  picker in `SideAgentPickers`.
- **Agreement** means a major verdict whose evidence overlaps the original's
  (design §11.5).
- **No key** for the confirming model's provider means no rewrite; the finding
  stays a flag.

**The rewrite.** `rewriteFlaggedNarration` (`observer.ts:926`) takes the
confirmed findings with their facts and the narration context (campaign plan
slice 2). It asks for a fix plan, a separator, then the prose.
- `parseFixPlan` checks that every quoted span exists in the original.
- The rewrite is re-checked by `runRung1` and `validateRewriteResponse`.
- On failure, the original is released with its flags.

**Public and private findings** (design §6, §11.4):
- `ScenePart.observerFlags` keeps private findings (evidence, kind), read only
  by the Debug Logs and the GM's next live block.
- A new `ScenePart.publicNotice?: "checked" | "revised"` is what the turn's
  details show.
- `buildPlayerView` and the guest broadcast never carry `observerFlags`.

**Tests:**
- agreement and disagreement;
- no key means a flag;
- a fix plan whose span is absent is rejected;
- a re-check failure releases the original;
- party redaction excludes the flags.

## Slice 4 — the labelled set and its runner (decisions 229, 233)

**The format.** A turn is `evals/turns/<id>.json`:
`{ id, published: boolean, facts, playerLine, toolResults, narration, labels: [{judge, severity, span}] }`.

**Where turns live:**
- **The published turns:** `evals/turns/public/`, only those the author
  approves one by one.
- **The private ones:** a folder outside the repository, given by
  `EVAL_TURNS_DIR`.

**The export.** `scripts/export-eval-turn.mjs` turns a Debug Logs or "Copy GM
context" export into a turn file with `labels: []`, for drafting.

**Labels.** Claude drafts them, and the author checks each.

**The runner.** `scripts/eval-judges.mjs`:
- **What it runs.** Each judge (combined and split) on each turn, `--runs 20`
  by default, at the shipped temperature.
- **What it reports,** per judge:
  - precision, recall and the false-flag rate, as denominated counts ("3
    failing runs of 20");
  - the cost from the ledger.
- **Who runs it.** It uses the author's keys from a local `.env.eval`, which is
  gitignored. It never runs in CI, and every run waits for the author's go.

**The first 30–50 turns** come from the author's Grave Watcher, Wolfwillow and
Blood & Bone logs, plus invented adversarial turns. A player line that decides
its own outcome is one of them.

**The deterministic checks** get ordinary Vitest tests over the published
turns, at no cost.

## Slice 5 — Settings and the turn details

**Settings → AI → Judges** (`ArchitectureSettingsTab.tsx`):
- per judge, Off / Flag / Rewrite and the sensitivity;
- each judge's measured precision, from the last run's summary in
  `evals/results.json`, when present;
- the confirming-model picker.

**The turn's details** show the public notice. The Debug Logs show the
private findings.

**The check:** a browser screenshot, and an APK after merge.

## Checks every slice

- The full suite and tsc.
- The `engine-review` agent on slices 1–3.
- Codex on slice 2's prompts, if the author wants.
- Docs: `CLAUDE.md`'s Observer paragraph, `judge-layer-design.md` superseded
  by this one, and pending tests (real-model behaviour waits for the author's
  go).

## Decisions made during implementation

(Filled in as the slices land.)
