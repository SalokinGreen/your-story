# Deep Audit: Concrete Defects in the Current GM Implementation

> Companion to `ai-gm-integration-plan.md`. That doc mapped the five-layer
> paper onto this codebase at the architecture level. This one goes a
> layer deeper: it traces actual runtime code paths (not just tool/schema
> names) and reports specific places where the implementation doesn't back
> up the guarantee its name implies. Everything below was found by reading
> the full source of `toolSchemas.ts`, `gmExecutor.ts`, `toolExecutor.ts`,
> `toolValidation.ts`, `commandResponses.ts`, `ai_staged.ts`, `gmTools.ts`,
> `reasoningTiers.ts`, `generation.ts`, `mythic.ts`, `mythicChaos.ts`,
> `compaction.ts`, `embeddings.ts`, `semanticSearchFallback.ts`, and
> `diceFormula.ts` — file:line references throughout are exact.
>
> **Status update:** all five Critical items (C1-C5) below have been fixed
> and verified with tests (see each item's own note). The High and Medium
> items are still open. C4's fix surfaced an additional, worse finding
> than originally reported: the "live" chaos mechanic wasn't just narrower
> than Mythic's real rule, it was *entirely inert* in production, because
> nothing anywhere ever populated `skillCheckHistory` - the gate the old
> `calculateChaosAdjustment` required before it would ever return a
> nonzero delta. Chaos factor could not change automatically at all before
> this fix; see C4 below for the corrected mechanic.

## Why this round found more

The first pass asked "does each of the five layers exist?" and the answer
was mostly yes. This pass asked "does the code that's supposed to enforce
each layer actually run, and actually enforce anything?" — and several
answers turned out to be no. The pattern repeats enough times to call out
explicitly: **a schema field, a tool description, or a function name
promising a guarantee is not evidence the guarantee is enforced.** Check
the executor, not the schema.

---

## Critical — fix first (small, mechanical, high blast radius)

### C1. Numeric bounds in tool schemas are decoration, not enforcement — ✅ FIXED

`toolValidation.ts` now enforces `minimum`/`maximum`/`minItems`/`maxItems`
(including inside `oneOf` branches); `create_quest`'s `points` schema got
an explicit `maximum: 500` to match its documented tier ceiling. Covered
by new tests in `tests/toolValidation.test.ts`.

`toolValidation.ts` validates `type`/`enum`/`oneOf`/array `items` — it
**never reads `minimum`/`maximum`**, even though dozens of schemas declare
them. Those bounds are hints the model sees in its context, not checks the
engine runs. Concrete exploit paths:

- `create_quest`'s `points` has no cap; `parsePointsValue`
  (`rpgSystems.ts:1987-1988`) returns whatever the model sends verbatim —
  a model could grant `points: 999999999` toward character level.
- `start_challenge`'s `required_successes` is documented `2..10`
  (`gmTools.ts:513-514`) but `gmExecutor.ts:1130-1132` accepts negative
  values with no rejection.
- `update_challenge`'s `successIncrement` (`0..3`,
  `toolSchemas.ts:1483-1484`) is likewise unchecked.
- `add_relationship`'s `value` (`-100..100`, `toolSchemas.ts:929-930`) —
  moot today since the tool is dead (see H1), but the same validator gap
  applies the moment it's revived.

**Fix:** one function. Add `minimum`/`maximum` (and ideally
array-`minItems`/`maxItems`) enforcement to `validateToolArgs` in
`toolValidation.ts`. This single change closes every bullet above plus
whatever's declared-but-unchecked elsewhere in the 106 schemas — audit
once, benefit everywhere.

### C2. `game_over` has no deterministic gate at all — ✅ FIXED

`toolExecutor.ts` now rejects `game_over` unless either an existing tier 6
(permanent) `Condition` matches the named `condition` argument, or the
player's own combatant is downed (HP ≤ 0 or inactive) in active combat.
Covered by new tests in `tests/toolExecution.test.ts`.

`toolExecutor.ts:2294-2335` — the only check on this tool is
`reason.length >= 10`. There is no requirement that HP hit zero, a
condition escalated to a terminal tier, or any failed roll occurred. **The
model can end the game purely because the narrative felt like it should
end.** This is the single clearest instance in the codebase of the model
holding authority the paper says must live in deterministic code —
"meaningful failure" (§2.6 of the source paper) means loss has to be
*earned* through the oracle/dice layer, not narrated into existence.

**Fix:** require `game_over` to reference a condition the engine can
verify — e.g., gate it behind a specific `Condition` tier, `HP <= 0` on
the tracked player combatant, or a failed roll logged in the current
scene — and reject/re-prompt otherwise, the same way a malformed tool
call is already rejected.

### C3. Combat has no invariants — ✅ FIXED

`update_combatant_stat` now clamps HP-like stats (`hp`/`health`/
`hitpoints`) at a floor of 0 and auto-flags the combatant `isActive: false`
the moment they hit 0, for delta, dice, and absolute (`=N`) forms alike.
`npc_roll` now rejects a call for any combatant other than whoever's turn
it currently is (when turn order is populated), while deliberately leaving
`update_combatant_stat`/`toggle_combatant_condition` ungated by turn order
since those apply the *consequences* of an action to whichever combatant
they target, not the actor's own turn. Covered by new tests in
`tests/gmTools.combatInvariants.test.ts`.

- `executeUpdateCombatantStat` (`gmExecutor.ts:2926-3009`) computes
  `newValue = oldValue + change` (or an absolute `"=N"` form,
  `:2934-2953`) with **no clamping**. HP can go negative or above max.
  Nothing auto-flags a combatant defeated at HP ≤ 0 — only the separate
  `remove_combatant` tool sets inactive (`:2858`). The tool's own
  *description* claims "cannot go below 0 unless system allows negatives"
  (`gmTools.ts:1333-1334`) — that floor is asserted in English, not code.
- `executeNPCRoll`, `executeUpdateCombatantStat`, and
  `toggle_combatant_condition` (`gmExecutor.ts:2884-3040, 3172-3272`) act
  on any combatant by name with no check against
  `combatState.currentTurnIndex` — the model can act the same combatant
  twice in a round, or skip others, with nothing to stop it.
- `executeAdvanceTurn` (`gmExecutor.ts:3277-3407`) can be called
  repeatedly with no intervening action.

**Fix:** clamp stat writes using the same bounds machinery as C1; add a
turn-ownership check to the combat-mutation tools when `combatState.active`
is true, rejecting/queuing out-of-turn calls the way an out-of-schema
argument is already rejected.

### C4. Chaos factor: two incompatible implementations, and the correct one is dead — ✅ FIXED

`checkScene` was also rolling a d100 against the 1-9 chaos scale (a die-
size bug independent of it being unwired - it made Altered/Interrupted
fire on only ~1-9% of scenes even at max chaos instead of Mythic's real
roughly-even odds); fixed to roll a d10, matching the rule documented in
`docs/mythic_notes.md`. `increment_scene` now calls `checkScene` every
scene transition, surfaces the result (and, on "Interrupted," a generated
random event the GM is told it must incorporate) to the model, and moves
chaos via `adjustChaosFactor` (+1 on Altered/Interrupted, -1 on Normal) -
the same external, roll-driven signal in both directions, never a model
self-report. The old `calculateChaosAdjustment`/`applyChaosAdjustment`/
`getChaosAdjustmentReason`/`addSkillCheckResult` functions were deleted
from `mythicChaos.ts` (confirmed unused elsewhere, including in tests);
`skillCheckHistory`/`currentStreak` remain on `AGMTState` as manually-
editable, informational-only fields since the story's Chaos/Oracle tab UI
still displays them. Covered by new tests in `tests/mythic.checkScene.test.ts`
and `tests/toolExecution.incrementScene.test.ts`.

This is worth calling out on its own because it directly affects the
integration plan's Phase 1 recommendation to "wire up `checkScene`."

- `mythic.ts:241-247` defines `adjustChaosFactor(currentChaos,
  adjustment)`, built to work with `checkScene`/`setupScene`
  (`mythic.ts:218-233, 538-569`) and matching Mythic's actual rule (raise
  chaos when a scene resolves chaotically/out of PC control, lower it when
  it resolves calmly). **None of `adjustChaosFactor`, `checkScene`, or
  `setupScene` are called anywhere in the codebase.** Confirmed dead.
- What's actually wired up and live is `mythicChaos.ts:14-75`,
  `calculateChaosAdjustment`, called from `toolExecutor.ts:1737` inside
  `increment_scene`. It's a win/loss-streak heuristic — weighted success
  rate plus a streak bonus, clamped `[1,9]`, cooldown-gated so it doesn't
  fire more than once per two scenes. It has **no relationship to scene
  control or outcome-as-narrated** — a scene can spin wildly out of the
  PCs' control with zero failed skill checks in it, and chaos will never
  move.

The mechanic this app's design assumes exists — "chaos reflects how much
control the protagonists have" — **does not actually exist**; something
narrower and unrelated is quietly running in its place. Fix this *before*
building the Director layer's scene-check integration on top of it, or
you'll be building pacing logic on a foundation that silently isn't the
one the rest of the design (and the Mythic fate-question weighting) is
written to assume.

**Fix:** decide which mechanic you want (the correct Mythic one already
sits written and unused) and either wire `checkScene`/`adjustChaosFactor`
into the live per-scene loop and retire `calculateChaosAdjustment`, or
deliberately fold the streak signal into `checkScene`'s inputs as one
factor among several. Either way, stop having both exist with only one
reachable.

### C5. Dice formulas have no bounds — ✅ FIXED

`parseFormula` now rejects dice counts/sides outside `1..100`/`1..1000`,
and rejects an exploding die with fewer than 2 sides (which would explode
forever, since a 1-sided die always rolls its own max). `rollDiceGroup`
also caps total explosions per die at 100 as defense in depth, independent
of the parse-time check. Covered by new tests in `tests/diceFormula.test.ts`.

`diceFormula.ts`'s `DICE_PATTERN` accepts unbounded `\d+` for both dice
count and sides, and none of the tool schemas exposing `formula`
(`gmTools.ts:683, 805, 1462`) cap it. A model-supplied
`999999999d6` would run `rollDiceGroup`'s loop
(`diceFormula.ts:234-246`) essentially indefinitely — a real perf/DoS
edge case with no guard, reachable from ordinary tool-call input, not just
adversarial testing.

**Fix:** cap count/sides in the formula parser (e.g. count ≤ 100, sides ≤
1000) and reject or clamp beyond that, before rolling.

---

## High — architecture gaps that enable sycophancy or silent drift

### H1. NPC relationship tools are dead schemas; the live path is ungated

`add_relationship`/`modify_relationship`/`delete_relationship`/
`edit_relationship` are fully defined (`toolSchemas.ts:912-1016`) but
**never added to the exported `TOOL_SCHEMAS` array**
(`toolSchemas.ts:1602-1667`) — the model never sees them. The live
mechanism for NPC disposition is `update_npc`'s `attitude`/`relationship`
fields (`gmTools.ts:1683-1745`), set entirely at the model's discretion
with zero oracle/roll gating. `npc_reaction` (`gmTools.ts:1776-1822`) is
purely cosmetic (a toast notification), also ungated. This is a direct,
concrete instance of the sycophancy failure mode the source paper
describes in §3.4 — nothing stops an agreeable GM from marking every NPC
"friendly" regardless of what the player actually did.

### H2. Random events are unenforced advisory text

When the fate oracle triggers a random event (d100 doubles,
`mythic.ts:174-211`), the only downstream effect is a bracketed hint
appended to the story context — `\n[⚡ RANDOM EVENT TRIGGERED! Consider
adding an unexpected twist.]` (`gmExecutor.ts:1952-1954`,
`story/page.tsx:2996-3007`). Nothing checks that the resulting narration
actually incorporated the event, its Focus roll, or its Meaning
action/subject pair — it can be buried in a throwaway sentence or ignored
outright with no flag, retry, or record.

### H3. Memory-compaction summaries are trusted LLM output with no validation

`compaction.ts:128-172` summarizes aged-out scene parts via an LLM call
(`/api/generate`), and `applyCompaction` (`:78-85`) writes the result
straight to `storyData.scene.summary` — no cross-check against canonical
`StoryData` (inventory, NPCs, lore, flags). A hallucinated detail in the
summary silently becomes permanent "memory" for every future turn, with no
mechanism anywhere to detect or correct the drift. (Failure during
compaction itself is at least non-fatal and doesn't drop mid-turn
information — `generation.ts:736-771` — so this is specifically about
trusting the *content* of a successful summarization, not about crashes.)

### H4. The "real" semantic memory path is dead code; the live fallback fails silently

`getRelevantContextForGeneration` (`embeddings.ts:518-559`) is imported
into `generation.ts:64` but **never called** — dead import. The only live
retrieval path is `semanticSearchFallback` (`semanticSearchFallback.ts:
33-60`), used only when literal `search_memory`/`search_notes` matches
come back empty (`gmExecutor.ts:2236-2252`). On any failure — embeddings
disabled, missing token, thrown error — it returns `[]`
(`:38-40, :55-59`), indistinguishable from "genuinely nothing relevant was
found." Nothing surfaces "memory retrieval is degraded" to the model, the
orchestrator, or the UI.

### H5. Tool calls still bottom out in a regex/pipe-delimited string engine — executed twice

`commandResponses.ts` isn't legacy-and-replaced; it's still the actual
execution backend for a large share of "clean" tool calls.
`toolExecutor.ts::convertToolToCommand` (`toolExecutor.ts:3259-3387`)
re-serializes already-validated tool arguments back into strings like
`` `/modify_ability: ${name} | costs | ${costsStr}` ``, which are then
regex-parsed by `executeCommandWithResponse` in `commandResponses.ts`.
Separately, `app/story/page.tsx:1690-1696` re-parses and re-executes the
*same command strings* client-side to mirror state. So the schema-
validated tool layer is a thin wrapper around a fragile
string-serialize-then-regex-parse engine underneath, and that engine runs
**twice** — once server-side, once client-side — for one logical state
mutation. This is a correctness/drift risk (the two parses can only stay
in sync by convention) as much as it is technical debt.

### H6. No deterministic content-safety layer exists at play-time

Searching the entire runtime generation path (`ai_staged.ts`,
`gmTools.ts`, `reasoningTiers.ts`, `generation.ts`) turns up zero
references to "PG-13," "NSFW," or any content filter. The `nsfw` flag on
an adventure record is catalog/search metadata only — it is **never
injected into the play-time GM/story system prompt**. A separate NSFW
instruction does exist, but only in the adventure-*creation* prompt
(`big_adventure_ai.ts:1097`), outside the actual play loop. There is no
moderation-endpoint call, no regex blocklist, and no equivalent of the
paper's Lines/Veils/X-card as enforced code anywhere in play — content
safety during actual sessions is 100% trust-the-model, and for a
meaningful stretch of the pipeline, not even prompted.

### H7. Reasoning-tier self-escalation is optional outside combat

`set_reasoning_tier`'s description tells the model to use it "only when
the current task genuinely exceeds your ability"
(`gmTools.ts:1018-1041`) — pure prompt guidance. `hardRuleFloor`
(`reasoningTiers.ts`) forces a tier floor for combat regardless of model
choice, and over-escalation is capped (`MAX_TIER3_CALLS_PER_SCENE = 3`)
and decayed back toward baseline. But for a tricky **non-combat** rules
call — exactly where a lenient model is most likely to want to avoid
rigorous adjudication — nothing forces escalation. A model that would
rather not roll a hard check can just narrate at the default tier and
never ask for more scrutiny.

### H8. Roll inputs are entirely model-asserted

The RNG itself (`diceFormula.ts`) is honest — but the modifiers and DCs
fed into `formula_roll`/`opposed_formula`/`formula_challenge_check` are
typed by the model from its own reading of the character sheet
(`gmTools.ts:619, 632, 699, 768`: "YOU must look up character stats and
insert the actual numeric values"), with no cross-check against a
structured source of truth. A model that wants to be lenient can quietly
type `+7` instead of the character sheet's actual `+3`, or lower a DC from
15 to 10 — and because the roll technically happens, none of the honest
oracle/entropy defenses in Layer 2 catch it. This is the least visible
sycophancy vector in the codebase: it hides behind a mechanism that looks,
and partially is, deterministic.

---

## Medium — cleanup and drift, lower urgency

- **M1 — Drifted duplicate event table.** `mythic.ts:5134-5147` defines a
  second `RANDOM_EVENT_FOCUS_TABLE` with *different* percentage bands than
  the live `EVENT_FOCUS` table actually used by `generateEventFocus`
  (`mythic.ts:252-264`) — e.g. "Remote event" spans 1-7 in the dead copy
  vs. 1-5 in the live one. Harmless today since it's unreferenced, but a
  future edit to "the" event table has a coin-flip chance of touching the
  wrong one.
- **M2 — No general invariant that a stated success/failure must be
  preceded by a roll.** This is the broader version of the original
  plan's Stage-0 ordering finding: it's not only that narration can run
  before tool resolution in a given turn, it's that **nothing anywhere
  audits whether a roll happened at all** for a contested action. `H8`
  and `skip_tools` (which only skips *state-mutation* tools, not GM-stage
  dice tools, so it isn't itself a bypass) both sit downstream of this
  same missing invariant.

---

## Revised priority order (supersedes §5 of `ai-gm-integration-plan.md`)

_Items 1-4 (all of C1-C5) are done — see the ✅ FIXED notes above. What
remains is H1-H8 and the Medium items, in the order below._

1. ~~**C1**~~ done.
2. ~~**C2, C3**~~ done.
3. ~~**C4**~~ done.
4. ~~**C5**~~ done.

Original text, preserved for the remaining items:

1. **C1** — add `minimum`/`maximum` enforcement to `toolValidation.ts`.
   One function; closes several holes (C1's own list, and pre-empts H1
   the moment relationship tools are revived).
2. **C2, C3** — gate `game_over`; clamp combat-stat writes and add
   turn-ownership checks. Small, mechanical, high defect-prevention value.
3. **C4** — resolve the chaos-factor duplicate before doing *any* further
   Director-layer work on top of it (this reorders ahead of the original
   plan's Phase 1, which assumed `checkScene` just needed a tool wrapper
   — it also needs its adjustment logic reconciled with what's actually
   live).
4. **C5** — bound dice formulas. Trivial guard, no reason to defer.
5. **H1, H2** — wire real NPC-relationship gating and enforce that
   triggered random events get addressed. Cheap relative to their
   sycophancy-defense value.
6. **H3, H4** — fix the memory trust chain. This has to happen before
   the original plan's Phase 3 (structuring memory) is worth doing — no
   point adding timestamps/entity links to memories whose content is
   already untrusted.
7. **H5** — the dual serialization/execution layer. This is a bigger,
   deliberate refactor (touches server and client); schedule it, don't
   rush it alongside the smaller fixes above.
8. **H6** — content-safety enforcement. This one depends on a product
   decision (what "safety" should mean for this app, and where the line
   sits) as much as an engineering fix — flag for that conversation
   rather than solving unilaterally.
9. **H7, H8** — fold into the original plan's Phase 2 (Layer 5
   hardening): the same consistency/leniency checker that catches
   narration-vs-state contradictions should also flag missing
   escalations and unverifiable roll inputs.

## Relationship to the original plan

`ai-gm-integration-plan.md` is still the right frame — it doesn't need to
be thrown out, it needs its scope widened. Concretely: Phase 1's
"wire up `checkScene` as a tool" recommendation stands, but now explicitly
includes retiring or reconciling `mythicChaos.ts`'s streak-based
adjustment so exactly one chaos mechanic is live (C4). Phase 2's
"consistency checker" scope grows from "narration vs. state" to also
cover `game_over`/combat/relationship gating and roll-input verification
(C2, C3, H1, H7, H8). Phase 3's memory work is blocked on H3/H4 being
fixed first, not just extended by them.

---

_Written against the codebase at commit `5f9323c` (July 2026)._
