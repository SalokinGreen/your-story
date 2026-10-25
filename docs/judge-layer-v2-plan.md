# The judge layer, version 2 — implementation plan

**Design:** [`judge-layer-v2-design.md`](judge-layer-v2-design.md), approved
("All three", decision 241). Decisions 226–229, 233–235, 237–238, 240.

## Before slice 1

The order and the prerequisites are the graph in
[`campaign-format-plan.md`](campaign-format-plan.md), "The order across the
three plans". J3 needs campaign slice 2's narration context; G2 and G5 need
J4's runner. Take the baseline on master after the prerequisites merge.

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

## Revised after Codex's review

Codex reviewed the three plans ([`research/codex-plans-review-2026-10-25.md`](research/codex-plans-review-2026-10-25.md)). Its findings for this plan
change the slices above as follows. Where this section and a slice disagree,
this section wins.

**The damage contract's shapes** (finding 6). `feat_roll` gains an optional
`target` in its params, its schema and its typed result (`GMFeatRollResult.target`).
- **The adapter.** `foeDamage({tier: result.outcome, magnitude: result.magnitude})`.
- **What it expects:** a `manage_meter` change on the target's Hearts this
  turn whose **requested** change equals the damage.
- **Clamping:** a meter that clamps at 0 is not a violation.

**Every correction goes through one path** (finding 12). On the held-output
code:
- **The speculative length rewrite** (`generation.ts:1278`) is removed. The
  length judge joins the combined call.
- **"The first major flag wins"** (`:1411`) is replaced by the design's
  priority order and the two-confirmation limit.
- **The optional mechanical retry** (`:1638`) stays, reachable only by the
  stored setting it has today, and is refused when it would re-run executed
  dice.

**The schemas** (finding 13):
- **Judge ids:** `JudgeId` is a union of the eight judges.
- **Verdicts:** `JudgeVerdict = { severity: "none"|"minor"|"major"|"unknown"; evidence: string; factIds: string[]; fix: string }`.
- **Validation:**
  - `evidence` must be a substring of the narration;
  - each `factId` must exist in the turn's facts;
  - a verdict that fails either is "unknown".
- **Confirmation** refuses a confirming model of the same family as the first
  judge (Anthropic), naming the family. `confirmModelFamily(modelKey)` reads
  `ai_prices.ts`.
- **The comparison switch.** `observerSettings.combined` is not a field.
  Instead, the old per-judge calls stay reachable only from the eval runner
  (`scripts/eval-judges.mjs --mode split`), never from Settings.
- **Settings migration.** The confirming picker's key joins
  `syncableSettingsKeys.ts`.
- **Default to flag.** A judge whose measured precision is below 0.7 ships as
  "flag" by default, through a `JUDGE_DEFAULT_OVERRIDES` table updated by hand
  from the runner's report.

**Every player-facing exit is generic** (finding 14):
- the rewrite toast (`page.tsx:2998`) says "Revised after a check";
- the Undo tooltip (`story.tsx:1113`) says "Undo revision";
- the original's stored `flag` keeps only its kind;
- guest snapshots (`multiplayer/session.ts:441`) strip `observerFlags` and the
  original's flag.

The campaign data leak to guests (§6.12) stays a named gap.

**The eval format** (finding 18) is versioned, in two kinds:
- **A judge fixture:** `{ v: 1, kind: "judge", storyBefore, storyAfter, toolResults, playerLine, narration, settings, labels }`.
  The before and after states let event contracts run.
- **A generation fixture**, for the GM prompt cases:
  `{ v: 1, kind: "generation", storySnapshot, playerLine, settings, scriptedToolResponses?, expect: { calls?: string[], noCalls?: string[] } }`.

The exporter writes either kind.

**What "beyond noise" means.** A case rises beyond noise when its failing
runs rise by more than 2 of 20 on two separate runs.

**The cost and latency budget** (finding 20):
- **Fact selection.** Each judge declares the fact kinds it reads, and
  `selectFactsFor(judgeId, facts)` hands it only those. A split call therefore
  carries less, not the same facts twice.
- **Ceilings per turn:**
  - one blocking call;
  - one background call;
  - two confirmations;
  - one rewrite;
  - one dawn reading (G5).
- **What the runner and the cost ledger record,** per turn kind (clean,
  split, confirmed, rewritten, timed out, no key):
  - total and discarded cost;
  - tokens and cache hits;
  - p50 and p95 time until release.

**Tests that catch the failures** (finding 19):
- a prohibited-dice re-ask test, where the re-ask round never calls a dice tool
  twice for one action;
- a secret canary in the rewrite request and the guest snapshot.

## Checks every slice

- The full suite and tsc.
- The `engine-review` agent on slices 1–3.
- Codex on slice 2's prompts, if the author wants.
- Docs: `CLAUDE.md`'s Observer paragraph, `judge-layer-design.md` superseded
  by this one, and pending tests (real-model behaviour waits for the author's
  go).

## Decisions made during implementation

(Filled in as the slices land.)
