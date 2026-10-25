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
(`kind: "generation"`) is defined for the GM prompt plan's runner and is skipped
by this one.

Generation fixtures live in `evals/generation/` (the first, from slice 3: full-mode setup asks one player step per call). Their `expect` is tool names; a case that needs argument checks adds an `expectArguments` key for the runner to read.

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
