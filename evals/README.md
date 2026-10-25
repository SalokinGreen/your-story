# The labelled turn set

Turns for scoring the judges (judge layer v2, slice 4; decisions 229 and 233;
`docs/judge-layer-v2-design.md` section 7). Each turn is one JSON file with the
story before and after, the tool results, the player's line, the narration and
the labels: which judge should flag it, how badly, and the words that show it.
An empty `labels` list is a good turn.

## Where turns live

- `evals/turns/public/` - turns the author has approved for the public
  repository, one by one. The 45 here were written for the set; none is from
  play, and every label says `"labelStatus": "drafted"` until the author has read
  the turn and set it to `"checked"`.
- A folder **outside** the repository, named by `EVAL_TURNS_DIR` (in the
  environment or `.env.eval`), for turns from the author's own stories that are
  not for publishing. The repository is public and a later commit that deletes
  a secret does not remove it from history.

A file that looks like it holds a provider key is refused by the format check.

## The format

`app/misc/judges/evalFormat.ts` holds it (`v: 1`). A judge fixture:

```
{ v, kind: "judge", id, published, note?, labelStatus?, systemId?,
  storyBefore, storyAfter, toolResults, playerLine, narration,
  settings?, replyLength?, tierUsed?, characterContext?, narrationThoughts?,
  labels: [{ judge, severity: "minor"|"major", span }],
  rung1Expect?: [rung-1 check names] }
```

`span` is a quote from the narration (the player's line, for the tier judge).
`rung1Expect` lists the deterministic checks that must fire (an empty list: none
may); `tests/judges.evalSet.test.ts` asserts it for free. A generation fixture
(`kind: "generation"`) is for the GM prompt cases and is skipped by this runner.

## The GM prompt cases

Generation fixtures live in **`evals/generation/`** (never in `evals/turns/public/`,
which the judge set test counts). `scripts/eval-generation.mjs` reads that folder
only; its runner is `app/misc/judges/generationEval.ts`.

```
{ v, kind: "generation", id, published, note?, storySnapshot, playerLine,
  expect: { calls?, callsAny?, noCalls?, proseMatching?, proseNotMatching?, narrationExcludes? },
  expectArguments?: { tool, maxDistinctSetupStepsPerCall?, everyFirstItemPerTagHas?, setupStepIn? },
  scriptedToolResponses?: [{ tool, result }] }
```

A case builds the GM's real request (`buildGMStagePrompt` on the snapshot and the
player's line), sends it to the model, answers each tool call from
`scriptedToolResponses` (never executed; an unscripted tool gets a "not available"
line) and goes on for at most `--max-rounds` (4). `calls` must all be called,
`callsAny` at least one, `noCalls` none, in any round. `proseMatching` and
`proseNotMatching` are case-insensitive regular expressions over the visible prose
(thinking removed). `narrationExcludes` lists phrases (case-insensitive substrings)
the prose must not contain; the runner checks the GM stage's prose, so a
narration-call case is scored on what the GM wrote. `expectArguments` checks the
`questions` of every call to `tool`: at most N distinct `setup_step` tags per call,
the first question under each tag carries each named field (such as `intro`), and
every tag is in `setupStepIn`. A provider failure is an error, counted apart from
failing runs.

```
node scripts/eval-generation.mjs                      # plan only: the cases and the calls; no call
node scripts/eval-generation.mjs --go --out evals/generation-baseline.json
node scripts/eval-generation.mjs --go --baseline evals/generation-baseline.json --out evals/generation-after.json
```

**`--go` calls a model on your keys and costs money; it waits for the author's go.**
It runs 20 times per case on Default (GLM 5.3) and Advanced (Claude Sonnet 5.5) as
shipped. A target case must fall against the baseline; no other case may rise by
more than 2 of 20 on two separate runs.

## Drafting a turn from your own play

```
node scripts/export-eval-turn.mjs story.json --id door-at-dusk --part 14 --out C:/private-turns
```

The input is a story's JSON export or a "Copy GM context" download. The draft has
`labels: []` and `published: false`; Claude proposes labels and the author checks
each. A story export holds the state after the turn, so `storyBefore` is a copy
of it: edit it if the turn changed a secret, an NPC or a meter.

## Scoring the judges

```
node scripts/eval-judges.mjs              # plan only: the turns and the number of calls; no call
node scripts/eval-judges.mjs --go         # 20 runs per turn, combined and split form
node scripts/eval-judges.mjs --go --runs 5 --mode combined --only agency-pc-speaks-a-promise
```

**`--go` calls a model on your keys and costs money; it waits for the author's
go and never runs in CI.** Keys come from a gitignored `.env.eval` in the
repository root (`OPENROUTER_API_KEY` and the others named at the top of the
script). The judges run on the side-agent default (Claude Haiku 5.5, effort
`none`) unless `--model` or `--effort` says otherwise.

The report gives, per judge, precision (any flag, and major only), recall and the
false-flag rate as counts with their denominators, the turns with the most
failing runs, the cost, tokens, cache hits and p50/p95 time by turn kind, and
the combined form against the split form. A judge under 0.7 precision at major
ships flag-only (slice 5 adds the `JUDGE_DEFAULT_OVERRIDES` table, updated by hand from the report). It
writes `evals/results.json` (private turns are counted, never named). A case
rises beyond noise when its failing runs rise by more than 2 of 20 on two
separate runs.
