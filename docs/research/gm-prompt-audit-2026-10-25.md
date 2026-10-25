# Audit: the GM's prompts against the prompt-engineering note (2026-10-25)

A read-only audit (a Sonnet reviewer) for decision 239. It read the GM's
prompts against the rules of a prompt-engineering note by Wes Brown, which the
author shared. That note is summarised in `judge-layer-v2-design.md` §4.

**Files read:**
- `ai_staged.ts`: the system prompt, the stable and live blocks, the
  session-zero block, the continuation prompt;
- `generation.ts`: the gate messages;
- `campaignPlan.ts`;
- the Blood & Bone turn-end checks;
- `observer.ts`;
- `reasoningTiers.ts`;
- part of `gmTools.ts`.

**What it is.** A static reading of the prompts: these are predictions, not
measured failure rates. Line numbers are `app/misc/` at `68f3cf7b`.

**Checked against the code before this was written:**
- the mechanics table row;
- the thread truncation;
- the "Fronts advance on their own" text;
- the M2 gate's message and forced tool choice.

All four hold.

## Findings, ranked

| # | Rule broken | Where | Predicted failure | Direction |
|---|---|---|---|---|
| 1 | Pattern plus exemption | `ai_staged.ts:2153-2156`: the dice rule and the oracle rule are opposed, then patched with "this is not a contradiction"; restated at `:2595` | Over- or under-rolling on the same input; this decides how play feels | One chain: a declared action whose failure changes the fiction → roll with the system's tool; else an unestablished world fact → oracle or table; else narrate. Minimal pairs. Delete the restatement and the "what feels safe" introspection |
| 2 | Explicit over implicit; two statements of one fact | `:2293` calls `mechanics` "always loaded"; `:2296`, `:2341` say pinned. The code lists it by title (§6.15) | The GM skips `read_notes` and improvises the rules | Name the pinned types (`dm_instructions`, `character_sheet`, `gm_plan`); say `mechanics` is read on demand; one statement |
| 3 | Never truncate | Thread descriptions cut to 200 chars (`gmTruncateDesc`, `:2025`), while `:2324` puts a Front's 2–4 escalation steps there | The GM cannot see a Front past its first step | Pass them whole (superseded by the campaign record's fronts) |
| 4 | A question the input cannot answer, with no decline arm | The M2 gate message (`generation.ts:3406`), sent with `tool_choice: "required"`; names four tools, not `action_roll` / `gm_roll` / `progress_roll` | A fabricated roll on a dialogue turn in a gated scene; the wrong tool in Blood & Bone | Name the tools from the set the gate checks; name "the action the player declared this turn"; add a decline arm; `auto` |
| 5 | Examples are the prompt | "ALWAYS start with <thinking>" (`:2163`, `:2219`), while the model's own history has its thinking stripped, and native-reasoning models get no prefill | The tag leaks into prose, or is dropped unevenly | State the rule once, only for non-native models; a plain "Ready." acknowledgement |
| 6 | Causal order; restatement after the chain | The player-turn message plans before reading (`:2592`), restates the thinking rule a third time (`:2600`); the system prompt closes restating length and agency (`:2343`) | The plan comes before the rules are read; last-read lines drift | Read, decide, roll, write; cut the restatements |
| 7 | Rejection without the repair; the model doing code's job | The setup gate message (`campaignPlan.ts:455-481`); the rejected round is removed so the model never sees it; it asks the model whether "the table has several players" | Both re-prompts burned on the same mistake | Branch by cause (prose question → `ask_question`; prose sheet → `create_note`); echo the rejected text; code decides `target_player_name` |
| 8 | Focus last; four statements of one field | The session-zero block's "next step" appears four times, before up to 9k tokens of reference | The wrong step asked, or steps batched against the rules | Reference first, one next-step line last |
| 9 | Pattern, exemption, counter-exemption | Full-mode batching rule (`:1314`), contradicted by "One question per step" (`:1343`) | Character steps batched, or table steps split | One chain by scope; code sets `allow_custom` and requires `intro` |
| 10 | One carrying line; the judge on a different boundary | The agency rule stated five times; stricter in the GM prompt ("only the outcome") than in the judge (ordinary steps allowed) | "Go on" leaves the GM between rules; the judge disagrees with the GM | One chain shared by the GM prompt and the judge, with the "go on" / "I attack" pair |
| 11 | Facts before the verdict | All judge JSON formats put the verdict first (`observer.ts:1264`, `:1500`, `:1132`, `:1656`, `:1810`) | The boolean is committed, then rationalised | Evidence first (judge v2 §4) |
| 12 | Never truncate | Judges' sheet and mechanics context cut to 1,500 and 2,500 chars "from the start" (`observer.ts:491-583`); reasoning to 2,000 | The outcome judge never sees the tier definitions | Whole, or a compact view of the tier table |
| 13 | A judge reads only what is filed with the item | The tool-usage judge decides what the GM "already knew" from the narration and mechanics alone (`observer.ts:1645`) | Any detail looks like an unrolled invention | File the established facts, or drop the oracle half |
| 14 | Code doing the model's job | The dawn check is a phrase table with exceptions (`blood-and-bone/turnEndChecks.ts`) | The next phrasing misses silently; each fix adds an exception | The model reads the prose; code checks only that `end_session` ran. Its message is well built and stays |
| 15 | Describe the thing as it is | "Fronts advance on their own via their doom clocks" (`:1779`, `:2324`); nothing ticks them (§6.1, §6.2); "advance-on" vs "advance-when" | The GM waits for a world that never moves | Say the GM ticks clocks (until the campaign record's engine ticks them) |
| 16 | Accreted exemptions | "A tag is NOT a trigger" with a parenthetical counter-exemption (`:2319`); the tags are never introduced | The spine advances on a tag, or never | A two-question chain |
| 17 | Reference points; the excluded case | The narration prompt names no grammatical person and no hidden-lore rule (`:2685`) | Person drift; secrets in the prose | Name the person; "only what the character perceives"; the hidden case with an example (with the campaign design's §14.1 narration context) |
| 18 | Contradiction | "Known NPCs are already provided IN FULL" (`:2166`) against a summary list | The GM skips reading an NPC's note | "NPC summaries; read the note for more" |
| 19 | The model counting | Word ranges in the length rule (`:1105`); one Bad/Good formula (`:2184`) | Counting the model cannot do; one example shape copied | Beats and sentences; code counts; a second pair |
| 20 | Examples contradict a rule | The note table's "Arc — Kael" against the rule naming "Kael" to avoid (`:2264`) | The example name is copied | Placeholder titles |
| 21 | Load-bearing effect left implicit | `formula_roll`'s `stakes`: high/deadly gates the scene and raises the tier, unsaid (`gmTools.ts:859`) | Casual "high" forces rolls for ~20 parts | Say what each tier does and that it lasts the scene |
| 22 | Plan before output | The rewrite prompt has no fix plan (`observer.ts:964`) | ~40% fix rate (the note's figure) | Plan, separator, prose (judge v2 §4) |
| 23 | Describe the current flow | Legacy setup blocks still say "create notes, then `start_game`" (`:2050-2087`), with rationale text | An old save loops on a refused tool | The current flow only |
| 24 | Unanchored levels | Sensitivity texts and "minor = borderline" (`observer.ts:428`) | Inconsistent flagging | Tie each level to a concrete rule |
| 25 | Introspection | `set_reasoning_tier`: "the task genuinely exceeds you" (`gmTools.ts:1335`), against "always escalate for plan work" (`:2302`) | Unpredictable escalation | List the triggers |

## The cache rule

No per-turn text was found in the system prompt or the stable block. The
stable block carries the player's name, summary and tags, which change once
when session zero ends. That invalidates the cached prefix once per story,
which is acceptable.

## What the prompts already do well

- **The outcome judge sees only engine-decided tiers** (`extractOutcomeVerdicts`), and `calculate` is the one place a roll becomes a verdict.
- **The turn-end check's message** states the condition, the action and a decline arm.
- **`formula_roll`'s `consequences`** asks for both outcomes before the dice land.
- **Most tool descriptions say what a tool does,** with no history.
- **The live and stable split is clean.**
- **`record_challenge_result` and the outcome judge keep one verdict per line.**
