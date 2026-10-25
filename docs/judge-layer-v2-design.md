# The judge layer, version 2 — design

**Status (2026-10-25):** approved ("All three", decision 241); **slice J1 built**
on `claude/judges-j1` (facts, rung 1 and the rung 2 re-ask; see the plan's
"Decisions made during implementation"); **slice J2 built** on
`claude/judges-j2` (the combined rung-3 call, its prompts and the three new
judges). Rungs 4 and 5 (confirmation, the rewrite with facts) are built (J3, `claude/judges-j3`); the labelled set and Settings are not
built. Earlier status: design, revised after Codex's review
([`research/codex-campaign-judges-review-2026-10-25.md`](research/codex-campaign-judges-review-2026-10-25.md);
its findings are answered in §11), for the author's go. Not approved for building.
Decisions 220–221, 237 and 240 (the judges on, output held; on branch `claude/judges-on`)
and 226–229 (`docs/decisions.md`). Research:
[`research/ai-supervision-2026-10-25.md`](research/ai-supervision-2026-10-25.md)
and [`research/campaign-and-judges-audit-2026-10-25.md`](research/campaign-and-judges-audit-2026-10-25.md).
It leans on the campaign record in [`campaign-format-design.md`](campaign-format-design.md)
for its facts. Version 1 is `docs/judge-layer-design.md`.

## 1. What the research says, and what it means here

| Finding | Source | What it means here |
|---|---|---|
| Self-correction without outside feedback often does not help and sometimes makes text worse | Huang et al., 2310.01798 | A rewrite is handed the engine's facts it must match. A judge's opinion alone never triggers one. |
| What can be counted should be code | Guardrails AI's fix-before-reask ladder | Dice tiers, damage, clocks, a dead NPC "present", banned words and leaked secret phrases are checked by code, free, every turn. |
| A judge from one model family favours its own family's writing; a small panel from different families beats one large judge | PoLL, 2404.18796; Panickssery, 2404.13076 | Haiku judges; before a rewrite, a second family must agree (decision 228). |
| LLM judges are unreliable at roleplay and character identity | PersonaEval, 2508.10014 | Character-voice judging stays out. World-consistency judging gets explicit facts to compare against, never "is this in character?". |
| Anchored rubrics with reasoning-then-score beat bare scores | G-Eval | Every judge prompt is a rubric with a good and a bad example, and asks for reasoning before the verdict. |
| Validate judges against labelled real turns | Judgemark v4; Zheng et al. | The labelled turn set (decision 229, §7). |
| Stream only what checks cannot change | NeMo, Constitutional Classifiers | Already decided (221). |
| Checking tool steps beats checking only the final prose | Lightman et al., 2305.20050 | Tool-usage problems are fixed by re-asking the GM inside the turn, before the prose is final, not by rewriting prose. |

## 2. The ladder (decision 226)

Every check sits on one rung. A turn climbs only as far as it needs.

**Rung 0: engine facts.** These are what the GM must not contradict:
- the turn's tool results (dice tiers, damage, meters, clocks ticked);
- the campaign record (lines, veils, secrets and their state);
- the NPC list (status);
- the character sheet;
- the system's rules.

They cost nothing.

**Rung 1: deterministic checks.** Code compares the narration and the turn's
calls against rung 0, every turn, at no cost:

| Check | What it catches |
|---|---|
| **Rules adherence** (per system, as declared **event contracts**, §11.2) | Only what a tool result can prove. Fantastic Realms: a `feat_roll` naming a foe target whose hearts were then changed by a different amount than its result's damage. Everything without a causal link (Blood & Bone's Exposure, which fiction may move) is advisory, a flag, never a re-ask. |
| **Dead or departed people** | The existing consistency check, extended to campaign people. |
| **Lines** | A line's keywords in the narration. Lines are written with keywords at session zero; the GM is asked for them. |
| **Secret phrases** | Any unrevealed secret's key phrases (3–6 words, from the record) in the narration before it is revealed. |
| **Pacing counters** | Turns since a clock last moved; turns since each player was addressed (couch and party); repeated phrases across recent turns (the existing `findRepeatedPhrases`). |
| **Tool-usage gaps** | A scene change and an "uncertain outcome" both need interpretation, so they are **heuristics**, not verified violations (§11.3). They flag, and only re-ask where the existing gates already do (combat, challenges, high stakes). |

**Rung 2: re-ask the GM.** A process fix, inside the turn, before the text
is final:
- A rung-1 hit that the GM can fix with a tool call makes the engine add one
  message and run one more round: "The goblin had 3 hearts and a strong hit
  does 2; record it" or "You changed scene; call `increment_scene`."
- This reuses the gates' mechanism (the M2 gate, the turn-end checks), so it
  stays under the existing round limit, with one re-ask per check per turn.
- Tool problems are fixed here, never by rewriting prose.

**Rung 3: LLM judges.** For what code cannot see, after the GM's final round.
Each judge runs only when a cheap precondition holds (§3).

**Rung 4: rewrite.** All four conditions must hold:
1. a rung-3 judge says **major**;
2. a **second judge from another model family agrees** (decision 228);
3. the judge type allows rewriting (Settings);
4. there are **facts to hand the rewriter**: the engine facts and the judge's
   specific finding, quoted.

The rewrite is validated as today (`validateRewriteResponse`). It happens
before the text is released (decision 221), and the turn keeps "Undo
revision".

**Rung 5: flag.** Everything else is a flag in the turn's details, counted
for the measurements (§7).

## 3. The judges

| Judge | Rung | Precondition | Facts it is given | Can rewrite |
|---|---|---|---|---|
| Length | 1 (count) → 3 (justified?) | Over the ceiling | The reply-length setting, the word count | Yes |
| Agency | 3 | A player line exists | The player's line, the prose | Yes |
| Outcome | 3 | A typed verdict exists | Each verdict, numbered | Yes |
| **World consistency** (new) | 1 → 3 | A person, place or item from the record or sheet is named | The named entities' facts: status, location, owner, last known; the sheet's gear and conditions; the last turns' summary | Yes, with the facts |
| **Secret leak** (new) | 1 → 3 | An unrevealed secret exists | The unrevealed secrets' truths, and the clues found so far | Yes: remove the leak only |
| **Rules adherence** (new) | 1 | Always (code) | The system's declared rules | No: re-ask (rung 2) |
| **Lines and veils** (new) | 1 → 3 | Lines or veils exist | Lines, veils | Yes: off screen for a veil, removed for a line |
| **Pacing and spotlight** (new) | 1 (counters) → 3 every 10 turns | A counter crosses its threshold | The counters, the brief | No: a note to the GM next turn, as the Story Progress Observer does |
| Oracle or table missed | 1 → 3 | No roll in a turn that decided an uncertain outcome | The turn's calls | No: flag (or re-ask) |
| Scene increment missed | 1 | Code | — | No: re-ask |
| Tier escalation missed | 3 | High stakes, below the top tier | The tier, the stakes | No: flag |

**Cost.**
- **The judges share one call.** All rung-3 judges whose preconditions hold
  go into **one combined Haiku call** per turn, returning a JSON verdict per
  judge, each with its reasoning, severity and quoted evidence. This keeps the
  common turn at one judge call or none.
- **The research's caution:** combined rubrics can bleed into each other. The
  labelled set (§7) measures whether the combined call is as accurate as
  separate calls, and any judge whose accuracy drops is split out.
- **The second-family confirmation** (GLM 5.3 by default, or whichever other
  family the player has a key for) runs only before a rewrite. With no other
  family available, a rewrite-eligible flag stays a flag.

## 4. The prompts (decision 238)

Every judge, re-ask and rewrite prompt is written to the rules of a
prompt-engineering note the author shared, by Wes Brown, measured on
decision-chain prompts run twenty times per test. The rules below are
summarised here. Each comes with what it changes in this layer.

**What code decides and what the model decides.** Code supplies the facts
whole and checks every answer it can check (rungs 0–1). The model is never
asked to count, compare numbers, or confirm membership in a list. The model is
asked only what is a reading of language.

**A rule is a decision chain, never a pattern with exceptions.** Each judge's
rubric is numbered questions, asked in causal order, each with its arms. A
fact the verdict depends on is asked before the verdict. The agency judge, for
example, becomes:
1. What did the player declare? Write it as `DECLARED`.
2. Quote each span of the narration where the player character speaks,
   chooses, feels, or acts. Write them as `SPANS`.
3. For each span: is it the declared action, or a step it plainly implies?
   - YES: fine.
   - NO: continue.
4. Is it new dialogue, a significant choice, a decided feeling, or a new
   action?
   - YES: a violation, with that span as its evidence.
   - NO: fine.

Today's agency prompt (`observer.ts`) is a "fine" list and a "violation"
list, the pattern-with-exceptions shape the note measured as firing on the
pattern before the condition is checked.

**The facts come before the verdict, each in its own named field.** The JSON
puts the facts first and the verdict last:
`{ declared, spans, reasoning, severity, evidence, fix }`.
Today's judges write the verdict first (`{"violation": …, "reason": …}`),
which commits the model before it reasons.

**Every reasoning line states what the input shows, then the answer.** A line
reads "the narration has her say 'I'll do it', which the player did not
declare: VIOLATION", never "VIOLATION, because…".

**Worked examples are minimal pairs.** Each judge carries two examples with
the same surface and opposite verdicts:
- "you take the ladder, rung by rung" after "I climb down": fine;
- "you take the ladder and tell her you'll stay" after "I climb down": a
  violation.

Each example's lines are in its own words, never one formula repeated. The
examples are invented, never taken from a player's story.

**A rewrite writes its plan first.** The rewrite prompt asks for a fix plan
before any prose. Each entry gives the quoted span, the finding and the
replacement text. Then a separator, then the rewritten narration. In the
note's measurements, rewrites alone fixed about 40% of flagged patterns, and
a plan written first made the rewrite follow it. The plan is checked by code:
every quoted span exists in the original. The rewrite is checked against the
plan.

**A re-ask carries the exact repair.** "The goblin had 3 hearts and a strong
hit does 2: call `manage_meter` adjust Hearts −2 on Goblin champion", never
"the damage looks wrong". Where the valid choices are not already in the
prompt, the re-ask lists them.

**Prompts describe the thing, never its history.** No decision numbers, dates
or "used to" in any prompt or tool description. Rationale stays in code
comments.

**No newline mid-sentence** in any prompt string, worked-example lines most of
all.

**Never truncate a judge's input.** When a turn's facts would be too many for
one call, the call's scope narrows (fewer judges per call) instead of a list
being cut.

**Testing (with §7).** A judge is tested by its behaviour on the labelled set,
never by its text:
- each case runs many times, at the temperature the judge ships with, and the
  result is a count such as "3 failing runs of 20";
- a fix's target case must fall, and no other case may rise beyond noise;
- a fixture's nouns come from a domain the real turns never use;
- a reproduction case uses the real turn's recorded inputs.

Evidence must be a quote from the narration. A verdict with no quote is
treated as none, which cuts false positives.

## 5. Severity and the actions

| Severity | Action |
|---|---|
| none | — |
| minor | A flag in the turn's details |
| major, rewritable judge, second family agrees, facts present | Rewrite before release (decision 221) |
| major, otherwise | A flag; the next turn's live block gets a one-line note for the GM ("Last turn contradicted: Marta is dead") |

Sensitivity per judge stays in Settings (0–10), and sets the precondition
thresholds and the severity cut.

## 6. Settings and visibility

Settings → AI → Judges lists every judge with Off / Flag / Rewrite (where
allowed) and sensitivity, and its measured accuracy once the labelled set has
run (§7).

Findings are split in two (§11.4):
- **Private findings** (evidence quotes, secret leaks, pacing) go to the Debug
  Logs and the GM's next live block, never to the player.
- **Public notices** go to the turn's details and say only that the turn was
  checked or revised, with "Undo revision". A removed secret leak is never
  quoted to anyone but the logs.

## 7. Measuring: the labelled turn set (decision 229)

**The set:**
- `evals/turns/`: real turns exported from the author's Debug Logs and story
  exports (the app's "Copy GM context" and the story JSON). Each turn is a
  small JSON file: the facts, the player line, the tool results, the
  narration.
- **Labels:** good, or the problem it has (judge type, severity, the quoted
  span).
- **Starting point:** the author's own play (the Grave Watcher session, the
  Wolfwillow and Blood & Bone sessions), plus hand-made adversarial cases. A
  player line that tries to decide its own outcome; a narration that names a
  secret; a dead NPC talking.
- **No secrets or keys,** and only the author's own stories. The repository is
  public, so the set holds only turns the author agrees to publish, or it
  lives outside the repository.

**The runner:**
- `scripts/eval-judges.mjs` runs each judge, in its combined or split form,
  on the set.
- It reports precision, recall and the false-flag rate per judge, plus the
  cost.
- **Every run calls a model on the author's key, so it waits for the author's
  go.** CI never runs it.
- The deterministic rung-1 checks get ordinary Vitest tests against the same
  turns, at no cost.

**What it decides:**
- a judge whose precision is below 0.7 on the set ships flag-only by default;
- whether the combined call holds up (§3);
- the sensitivity defaults.

## 8. What stays from version 1

The rest of version 1 is kept:
- the checked rewrite path;
- the patch-by-id background model;
- "Undo revision";
- the hold (decision 221).

**Decision 221 is a prerequisite, not a current fact.** Its build, on
`claude/judges-on`, must land first. It holds the text, has the background
wave only flag, and covers inline narration, the continuation, read-aloud and
party delivery. A test asserts that no background path rewrites.

## 9. Slices (for the implementation plan)

1. **The rung-1 checks and the rung-2 re-ask:**
   - the rules declaration on `BuiltinSystem`;
   - the Fantastic Realms and Blood & Bone rules;
   - lines;
   - secret phrases;
   - pacing counters;
   - the re-ask round.
2. **The combined rung-3 call:** the rubric prompts and the JSON verdicts,
   plus the new judges (world consistency, secret leak, lines and veils,
   pacing).
3. **The second-family confirmation** before a rewrite, and the facts handed
   to the rewriter.
4. **The labelled set's format and runner,** and the first 30–50 labelled
   turns from the author's logs. Labelling is the author's call; Claude
   drafts the labels for the author to check.
5. **Settings and the turn details:** evidence quotes and per-judge accuracy.

Slices 1–2 depend on the campaign record (lines, veils, secrets and people)
for their facts. They can start with today's NPCs, sheet and notes, and
widen when the record lands.

## 11. Revised after Codex's review

Codex's findings 4, 6, 7, 10 and 11, and the judge half of 12, are answered
here.

### 11.1 The turn, in order

```
GM rounds --> tools execute (clocks tick, facts recorded)
   |
   +- rung 1 checks (code, on the GM's final round)
   |     +- a verified, tool-fixable violation? --> one re-ask round (rung 2)
   |                                               (shares the gates' round budget;
   |                                                never re-runs executed dice)
   v
narration (allowlisted context, campaign design 14.1) -- text held (221)
   |
   +- combined judge call (rung 3), only judges whose preconditions hold
   |     +- a major, rewritable finding with facts --> confirming judge
   |           +- agrees --> rewrite with the facts --> re-validated by rung 1
   v
release once --> the background wave: flags only
```

### 11.2 Event contracts (finding 4)

A system declares checkable contracts on `BuiltinSystem`, as it declares
turn-end checks:
`{ id, when: { tool, resultType }, requires: { tool, match }, message }`.

**The Fantastic Realms example.**
- **When:** a `feat_roll` with a `target` (a new optional field naming the
  foe) and a hit tier.
- **Requires:** a meter change on that target, in this turn, equal to the
  damage.

**What does not trip it:**
- A burn on the current roll is legitimate.
- A clamped meter write is not a violation.

**When it trips** (a verified violation): one re-ask.
**What has no contract:** the semantic judges look at it as advisory.

### 11.3 Facts with provenance (finding 10)

Every fact handed to a judge or a rewriter carries an id, its source (a tool
result id, a record part id, the sheet, an NPC id) and when it held (before
the turn or after it).

**Verified violations** are rung-1 hits backed by a tool result. Only these
re-ask. **Heuristics** (a scene change, an item from a free-form sheet, an
uncertain outcome) only flag or feed a judge.

NPCs have no canonical location or ownership today. World consistency uses
only status and the record's location links until they do.

### 11.4 Public and private (finding 6)

The split is in §6. The party phones and online guests get only public
notices. `buildPlayerView` never receives findings.

### 11.5 The combined call, the confirmation and the rewrite (finding 11)

**The combined call's reply** is keyed JSON:
`{ "<judgeId>": { severity, evidence, factIds, fix } }`. A missing key or
malformed JSON counts as "unknown" for that judge (no flag), and is logged.

**Agreement.** The confirming judge is asked the same rubric for that one
finding. It agrees when it also says major and quotes overlapping evidence.

**Priority.** When several majors land, the order is:
1. safety (lines and veils);
2. secret leak;
3. outcome;
4. world consistency;
5. agency;
6. length.

One rewrite addresses them all, handed every confirmed finding's facts.

**The budget.** Per turn:
- at most one re-ask round;
- one combined judge call;
- one confirmation per rewritable finding, at most two;
- one rewrite.

**The rewrite** is re-checked by rung 1 and `validateRewriteResponse`. If it
fails either, the original is released with its flags. Executed dice and
state are never re-run.

**The cost.** The expected cost is about one Haiku call per turn, at roughly
2–4k input tokens with the facts. A rewrite turn adds a confirmation and a
rewrite on the narration model. The plan measures it with the cost ledger.

## 10. Settled

| # | Decision |
|---|---|
| 233 | The labelled set: the runner and format live in the repository. A turn goes in only once the author approves it for publishing; the rest stay in a private folder outside the repository. |
| 234 | The confirming judge is the player's pick, under Settings → AI → Advanced, with GLM 5.3 as the default. |
| 235 | Pacing notes are for the GM only. |
