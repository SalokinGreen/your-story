# The judge layer, version 2 — design

**Status:** design, for the author's review. Not approved for building.
Decisions 220–221 (the judges on, output held; on branch `claude/judges-on`)
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
| **Rules adherence** (per system, declared like turn-end checks, decision 183) | Fantastic Realms: a foe's hearts changed by a different amount than the result's damage table says; a burned feat narrated as used. Blood & Bone: Exposure or Heat moved without the move that moves it. General: a meter written outside its range (already refused). |
| **Dead or departed people** | The existing consistency check, extended to campaign people. |
| **Lines** | A line's keywords in the narration. Lines are written with keywords at session zero; the GM is asked for them. |
| **Secret phrases** | Any unrevealed secret's key phrases (3–6 words, from the record) in the narration before it is revealed. |
| **Pacing counters** | Turns since a clock last moved; turns since each player was addressed (couch and party); repeated phrases across recent turns (the existing `findRepeatedPhrases`). |
| **Tool-usage gaps** (deterministic first) | A scene change in the prose with no `increment_scene`; an uncertain outcome with no roll, detected by the existing roll gate. |

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

## 4. The prompts

Every judge prompt follows one shape:
1. **The principle**, one or two sentences.
2. **One good example and one bad one**, short and original.
3. **The facts**, numbered.
4. **The narration.**
5. **Reasoning first**, then `{severity: none | minor | major, evidence: "<quote>", fix: "<one line>"}`.

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

The turn's details show each flag with its evidence quote. "Undo revision"
stays.

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

The background wave already only flags (221).

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

## 10. Open questions for the author

- **Should the set live in the public repository?** Proposed: only turns you
  agree to publish; the rest in a private folder outside the repository.
- **Which model family confirms rewrites?** Proposed: GLM 5.3 through
  OpenRouter, which every default player can reach. The first judge is
  Haiku, a different family. GLM is also the default narrator, so it may lean
  towards keeping GLM-written prose. That bias errs towards fewer rewrites,
  which is the safe side.
- **Should a pacing note ever reach the player?** ("No clock has moved in 12
  turns.") Proposed: no, GM only.
