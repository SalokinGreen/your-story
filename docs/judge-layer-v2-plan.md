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

### 2026-10-25 — slice 1 (J1), rung 1 and the re-ask

- **`reask` takes the failure too.** `EventContract.reask(turn, failure)`, not
  `reask(turn)`: the message names the exact remaining `by`, which needs what
  `expects` found. `ContractTurn` carries `trigger`, `results` and `storyAfter`.
- **Foe-damage applies only to a foe that has a Hearts meter** (in the story
  after the turn, or created this turn by `manage_meter`). A foe tracked nowhere
  has nowhere to record the loss, so nothing is provable and nothing is asked.
  The Fantastic Realms core note now tells the GM to pass `target` and keep a
  foe's Hearts on a meter (one sentence in section 6; the core is still under
  its 3,000-token cap). Several `feat_roll`s on one foe are summed; a `set`
  counts as `before - requested`. Net change is compared, so a healing write in
  the same turn can mask a missing one (accepted).
- **A tools-only re-ask keeps the draft; only a line's re-ask replaces it.** The
  plan says the re-ask's prose replaces the final round's. For a damage contract
  the GM's reply is an acknowledgement ("Recorded."), and replacing the story
  with it would destroy the turn. So `Rung1Hit.replacesProse` is true only for
  lines; for a contract the round's calls run and its text is dropped. A
  mixed re-ask (both kinds) replaces.
- **Lines are "verified" and re-ask, secrets and dead people are not.** The
  table says lines re-ask; the keyword is a literal whole-word match, so it is
  marked verified. The message lets the GM answer with the same text when the
  word does not cross the line. Secret phrases feed the secret-leak judge
  (slice 2) and only log; the departed-person check is the existing name-match
  heuristic and flags only. Lines are read from the story as the turn found it.
- **Dice are refused, not hidden.** The tool list stays the one stable list (the
  cache rule). During the re-ask any `DICE_TOOLS` call is not executed and gets
  an `[ERROR]` result in its place, so the transcript stays well formed
  (`mergeRefusedDiceCalls`, exported for the test). The refused result also
  enters `gmResults`, as an error, which every reader already skips.
- **The re-ask sees the final round's prose only.** *Revised the same day by the
  engine review (below): it now reads all unreleased prose.* A line in a separate
  narration call is still not re-asked (the narration is not written yet at that
  gate); the post-narration pass logs it.
- **Pacing counters use turns, not scenes.** Nothing records when a clock last
  moved, so "turns since a clock moved" reads the prior parts' stored tool
  messages for a `[Clock` line (10 turns, `PACING_CLOCK_IDLE_TURNS`); the
  spotlight counter is 4 turns by name in the prose (`PACING_SPOTLIGHT_TURNS`,
  two or more couch or party players). The note is `ScenePart.pacingNote`,
  joined to the story-progress check-in block of the next turn. The repeated
  phrase hit reuses `findRepeatedPhrases` over the last 4 turns and this one.
- **Snapshot, not a full clone.** `snapshotJudgeView` copies only the campaign
  record, NPCs and meters at the start of the attempt (`JudgeStoryView`), not
  the scene.
- **Not done in this slice:** the sheet facts (`source.kind: "sheet"` exists in
  the type; the world-consistency judge, slice 2, is its first reader), and the
  removal of the speculative length rewrite and "first major flag wins"
  (revised finding 12), which belong with the combined call (J2/J3) because they
  change how the judges' output is used; no judge behaviour changed here.
- **Where the held text matters.** With the default settings the turn is held
  (decision 221), so a replaced draft is never shown. When every judge only
  flags, text streams live and a draft that is later replaced has already been
  on screen once. *Revised by the engine review (below): a campaign line with a
  keyword now holds the text whatever the judges are set to.*

### 2026-10-25 — engine review of J1 (ten findings, all fixed)

1. **`pacingNote` is saved.** The page's three `onComplete` handlers copy it
   from `result.scenePart` with the other named fields; before, only the
   generation result carried it, so the next turn read nothing. Tested on the
   read side (`tests/generation.reask.test.ts`, "the pacing note"); the page
   copy has no unit test (the page is not testable headless) and is on the
   pending-tests list.
2. **A prose re-ask replaces exactly the unseen span.** The draft is everything
   accumulated after `pauseReleasedEntry`: its accumulation entries, its
   `gmThinking` entries (from `pauseThinkingMark`) and its final-round context
   part are set aside; the message quotes the whole passage; the accumulation and
   thinking de-duplication is off for the answering rounds, so a reply that
   repeats an earlier round is kept. On an answer with words the draft's
   assistant messages keep their reasoning and tool calls but lose their prose;
   on no words every part of the draft comes back and nothing the re-ask rounds
   wrote around their calls stays.
3. **A line word in an earlier round is caught**, by the same span. (Reverses the
   "final round only" decision above.)
4. **Pacing notes fire once per run.** The clock note fires as the count of turns
   without a move (this one included) reaches each multiple of 10; the spotlight
   note the same, per player, at multiples of 4. Migrated records, clocks from
   migrated timers and manual-only clocks are left out of the clock counter. The
   current part (`options.scenePartId`) is dropped from `priorParts`. Repeated
   phrases need three words, exclude phrases containing an NPC's or a player's
   name word, and are said once per run (the previous turn's note is checked).
   A player counts as addressed by their character's name too (an owned sheet
   titled "Character: <name>").
5. **Foe-damage:** a target that is a hero (`systemState.fantasticRealms.heroes`)
   is no foe; more hearts recorded than owed is a flag (`ExpectResult.flagOnly`),
   never a re-ask, because the fix would heal the foe.
6. **The re-ask has its own refusal list** (`reaskRefusal`): every dice tool, the
   oracles (`fate_question`, `roll_table`, `roll_portent`) and `manage_track`'s
   `progress_roll`.
7. **Rung 1 is skipped when the roll gate removed the round** (`rollGateDeclined`).
8. **Pausing tools are refused in a re-ask** (`ask_question`, `ask_for_roll`,
   `confirm_setup`), with the same refusal shape.
9. **A campaign line with a keyword holds the live text** (`storyHasLineKeywords`
   joins `canObserverTriggerReset` in `holdTurnText`), so a word the re-ask may
   remove never streams, even with every judge on Flag.
10. **Refused re-ask calls are hidden**: not pushed to `gmResults`, not sent to
    `onGMToolResult`, but their `[ERROR]` tool messages still go to the provider.
    (They are tracked in a `WeakSet`, `isReaskRefused`.)

### 2026-10-25 — re-check of J1 (four fixes, branch `claude/judges-j1-fixes`)

1. **No empty assistant message.** In a worded re-ask reply, a draft message
   with no tool calls whose prose goes is removed from the conversation; one
   with tool calls keeps them and its reasoning and loses only prose. The
   re-ask rounds' own preambles around tool calls are stripped the same way
   (`ReaskState.askIndex` marks where the re-ask message sits).
2. **Only the answering round is story.** The turn's text is rebuilt from the
   prose-only round that answered; an introduction or refusal
   (`REWRITE_META_OPENERS`, now exported, not `validateRewriteResponse` whole:
   its "unchanged" rule is wrong here because the message allows "reply with
   the same text") gives the draft back and drops that answer message.
3. **Refused calls stay hidden after a reload.** The refusal text now carries
   `REASK_REFUSAL_TAG`; `buildSavedTimeline` skips any call whose tool message
   carries it. No new field on the part.
4. **A migrated record no longer disables the clock counter.** The record-level
   `origin === "migrated"` return is gone; migrated-timer and manual-only
   clocks are still filtered per clock.

### 2026-10-25 — slice 2 (J2), the combined judge call

Built on `claude/judges-j2`. Files: `app/misc/judges/prompts.ts` (rubrics, the
shared `AGENCY_CHAIN`, the prompt builders), `app/misc/judges/combined.ts`
(preconditions, the split, parsing, flags, priority), `facts.ts` (topics,
`selectFactsFor`), and `observer.ts` / `generation.ts` wiring.

- **Eight judges, as ids:** length, agency, outcome, world_consistency,
  secret_leak, lines_veils, oracle_gap, tier_gap. The plan's "oracle and tier
  gaps" is two judges. **The scene-increment question is not a judge any more:**
  the design lists it as code (rung 1), so it is `sceneIncrementFlag`, a phrase
  check ("the next morning", "hours later", "time passes"…) with no
  `increment_scene` call. It is a heuristic: minor, major only at the old
  sensitivity 8, never rewrites. The LLM version survives in `runObserverSplit`.
- **Three new flag types** (`world_consistency`, `secret_leak`,
  `lines_and_veils`) in `ObserverFlagType`. They are in `FLAG_ONLY_FLAG_TYPES`,
  so `settingsFor` forces `triggersReset` false: **they flag only** until slice 3
  gives the rewriter their facts and a confirming judge. J3 moves them into
  `REWRITABLE_FLAG_TYPES`.
- **Old settings keep working, no version bump.** `ObserverSettings` is now the
  six legacy keys plus the three new ones as optional; `settingsFor` reads a
  missing one from the defaults (on, sensitivity 5). `CompleteObserverSettings`
  is the shape of the defaults and of `getObserverSettings()`. The `FLAG_ONLY`
  fixture turns the three new ones off, because decision 187's table never had
  them. Settings (slice 5) got a minimal Off / Flag row for each new judge so a
  player can turn them off now.
- **Preconditions** (`selectJudges`): agency needs a player line (the old agency
  call also judged an opening with no line; the design table says "a player line
  exists"); world consistency needs the prose to name, as a whole word, a person
  or place a fact carries (`Fact.names`), and the sheet facts ride along only
  then (a free-form sheet has nothing cheap to trigger on, finding 10); secret
  needs an unrevealed secret fact; lines and veils need a line or veil fact; the
  oracle judge needs no oracle/table tool this turn; the tier judge needs a tier
  below the top.
- **Facts.** `Fact` gained `topic` and `names`. `collectTurnFacts` now also adds
  the character sheet(s) whole and one "the record places X here" fact per
  campaign location with people, appended after the existing facts so earlier
  ids do not move. The world judge's "last turns' summary" fact is **not**
  built (no summary source that is not the GM's own words).
- **The split.** About 3,000 estimated tokens of selected facts
  (`JUDGE_FACT_BUDGET_TOKENS`, chars / 4) split the call into the engine judges
  and the judges of the record; a group that is still too large goes alone,
  whole. Never truncated.
- **Validation.** A flag with an empty quote is "unknown" (the plan's finding 13;
  the design's "no quote counts as none" gives the same result, no flag, and the
  Debug Logs say why). A quote may skip words with an ellipsis and is matched
  through curly quotes and case. The tier judge's quote may come from the
  player's line.
- **Sensitivity** is a per-judge "cut" line at the end of the user message
  (`cutLine`), replacing `sensitivityInstruction` for the combined call. The
  length judge's sensitivity still moves the code-side ceiling too.
- **Priority** (revised finding 12): `pickMajorFlag` replaces "the first major
  flag wins" at the end-of-turn pass and at a pause, in the design's order
  (`FLAG_PRIORITY`). **Not built here, belongs to J3:** the two-confirmation
  limit and "one rewrite addresses them all" (no confirmation exists yet; the
  one rewrite still addresses the one chosen flag).
- **The speculative length rewrite is removed**; `tests/generation.speculativeRewrite.test.ts`
  became `tests/generation.lengthRewrite.test.ts`. `alsoFixIfPresent` and
  `ALSO_FIX_CLAUSES` in `rewriteFlaggedNarration` have no caller now; they stay
  for J3 to replace with confirmed findings.
- **The mechanical retry** (tier escalation) is refused when the turn already
  drew randomness (`executedRandomness`: dice tools, oracles and tables, a
  track's progress roll; not `calculate`). Three tests that used a `formula_roll`
  to satisfy the roll gate now let the GM decline the gate with prose instead;
  one new test covers the refusal.
- **No `combined` setting.** `runObserverSplit` is the old per-judge runner,
  exported for the eval runner only; no Settings path reaches it.
- **Private evidence.** `ObserverFlag` gained no field: a flag's `detail` is the
  judge's one-sentence fix, except a secret-leak or lines-and-veils flag, whose
  detail is fixed and generic. Quotes and fact ids go to the Debug Logs only.
  The public/private split of `observerFlags` is J3.
- **Cost estimate.** `turnCostEstimate.ts` and `countJudgeCalls` now count
  passes (one shared call), not checks.
- **Test helpers.** `tests/helpers/combinedJudges.ts` (`isJudgeCall`,
  `requestedJudges`, `judgeReply`); the suites that scripted per-judge JSON
  answer in the combined shape. `tests/observer.test.ts` keeps the version-1
  coverage through `runObserverSplit`.
- **GM request digests** (`tests/campaign.oldSaves.test.ts`) did not change: no
  GM prompt, tool list or block moved.

### 2026-10-25 — engine review of J2 (seven findings, all fixed)

1. **A secret revealed this turn is no leak.** `collectTurnFacts` skips a secret
   that is revealed in the story after the turn as well as before it.
2. **A judge's `fix` never reaches the player.** Every flag `detail` is a fixed
   sentence per judge (length keeps its word counts); the `fix` goes to the
   `correctivePrompt` and the Debug Logs. A rewrite is therefore told the rule
   that was broken ("took a decision away from the player…"), not the judge's
   wording, until J3 hands it the facts. Tested with a canary in a secret, an
   NPC status, a gm_roll line and a line, across all eight judges.
3. **Quotes.** `quoteAppearsIn` strips surrounding quote marks and stray
   punctuation, `*` and `_`, folds hyphens and dashes, requires the fragments in
   the text's order, and refuses a quote under three words and twelve characters.
4. **Reply cap.** `judgeMaxTokens` = 260 per judge + 240 + one third of the
   narration's characters, at most 8,000, so span lists fit on a long turn.
5. **Cost.** `countJudgeCalls` counts passes: a default turn is `always: 2`
   (the agency pass before release, the oracle/tier pass in the background),
   `sometimes: 0`; `turnCostEstimate` uses it (expected `always + 0.4 *
   sometimes`, low `always`, high `always + sometimes + 1` for a pause), with
   `OBSERVER_OUTPUT_TOKENS` 450 and input 2,600. CLAUDE.md says "one call per pass".
6. **One rewrite fixes the other majors.** `alsoFixTypes` hands the other
   rewritable majors to `rewriteFlaggedNarration` as `alsoFixIfPresent` (end of
   turn and at a pause); `ALSO_FIX_CLAUSES` gained a `response_length` clause.
   `runObserverSplit`'s comment now says the eval runner is slice J4 and not yet
   written.
7. **`generate_name`** counts as randomness in `executedRandomness`.

### 2026-10-25 — slice 3 (J3), confirmation and the rewrite with facts

Built on `claude/judges-j3`. Files: `judges/confirm.ts` (model, agreement, rewriter
facts, the gate), `judges/correction.ts` (`confirmAndRewrite`, the one path for the
end-of-turn pass and the pass before a pause), `judges/rewritePlan.ts` (findings
block, `parseFixPlan`, `planFollowed`, `recheckRewrite`), `judges/publicView.ts`
(`withoutPrivateFindings`, `kindOnlyFlag`), plus `observer.ts`, `generation.ts`,
`layerSettings.ts`, `ai_prices.ts` (`confirmModelFamily`), Settings, page and story.

- **Every rewrite is confirmed, the prose judges included.** Length, agency and
  outcome used to rewrite on one judge's word (decision 220); they now need the
  second family too, as the plan's rung 4 says. A player with no OpenRouter key
  (the default confirmer is GLM 5.3), or whose Observer already runs on a GLM, gets
  flags instead of rewrites until they pick another confirming model.
- **The confirming call is the same single-judge rubric** (`callJudges` with one
  judge, blind to the first verdict). Agreement is major plus a shared run of three
  words of quote (`evidenceOverlaps`). Disagreement and unknown both keep the flag.
- **The new judges default to Flag, not Rewrite.** They have no measured precision
  (slice 4); `FLAG_ONLY_FLAG_TYPES` no longer lists them and they are in
  `REWRITABLE_FLAG_TYPES`, so Settings offers Rewrite. `plausibleResetFlagTypes`
  takes `facts` so a turn waits for them only when their precondition holds.
- **No fallback confirmer.** The player's pick or GLM 5.3; a pick the catalog
  dropped reads as the default. Same family as the first judge, no key, or a
  subscription model that cannot run: no confirmation, logged with the reason.
- **Rewriter facts are cited facts only**, from `REWRITER_TOPICS` (outcome: results;
  world: people, places, results; lines and veils: line and veil text). Never a
  secret, a clock, the sheet (already in the narration context), a hidden tool's
  result (`hiddenToolRefs`, via `publicSummary`) or a person the prose does not
  name. A secret-leak rewrite gets the quoted statement and a rule, nothing more.
  Findings of a leak or a line keep no `fix`.
- **`alsoFixIfPresent`, `ALSO_FIX_CLAUSES` and `alsoFixTypes` are gone**; one rewrite
  addresses the confirmed findings. Three tests of the clauses were removed.
- **The fix plan is strict.** No separator, no plan, an empty plan, a span not in the
  original, or a replaced span of four or more words still in the prose: the original
  is released with its flags. The re-check fails closed if it cannot run.
- **`ObserverFlag.finding`** (quote, fact ids, fix) is stored on `observerFlags`
  (private; the Debug Logs, the confirmer, the rewrite). `ScenePart.publicNotice`
  is set ("revised" when a rewrite landed, "checked" when a flag stayed, also by the
  background wave). The turn's details do not display it yet: that is slice 5.
- **Guests** lose `observerFlags`, `correctedObserverFlags` and the whole
  `observerRewriteOriginal` (its draft is the text the judges objected to), so an
  online guest has no Undo revision. Toasts and the Undo tooltip are generic.
- **Tests that scripted a rewrite** now pass an OpenRouter key and answer in the
  fix-plan shape (`rewriteReply` in `tests/helpers/combinedJudges.ts`).
- **Not done:** the `engine-review` agent run (no agent tool in this session), and
  the turn-details display of the notice (slice 5).
