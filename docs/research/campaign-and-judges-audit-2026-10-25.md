# Audit: campaign structure and the judge layer (2026-10-25)

A read-only audit (the `code-explorer` agent, Haiku) of master at `68f3cf7b`,
before the redesign the author asked for: "look in depth at campaign setup,
the whole format and parts, and also on the judge layer … improve and grow
those 2 features". File:line references are to that commit. Nothing was run.
The Fantastic Realms branch and the judges-on branch (decisions 220–221) were
not yet merged when it ran.

## Corrections to what the docs implied

- **`planSpineLength` is a `create_note` argument, not a function.** It is read
  only when the note's title matches `/campaign plan/i` and no `planState`
  exists (`toolExecutor.ts:733-745`). Otherwise the spine silently defaults to
  medium.
- **Fronts are a prompt convention, not data.** A front is a background thread,
  a timer as its doom clock, and an index in the plan note
  (`ai_staged.ts:2360-2364`). `StoryThread.linkedTimerId`, the field that
  would tie them together, has no writer (`structs.ts:1137`).
- **Chapters are dead in play.** Nothing creates chapters and `currentChapter`
  never increments. `max_chapters` defaults to 0.

## A. The parts of a campaign today

| Part | Written by | Read by | Problems |
|---|---|---|---|
| **Session-zero state** (`StoryData.setup`) | Engine (`recordCreationSteps`, `confirm_setup`) | GM (`buildSessionZeroBlock`, the live block); SetupStrip, SetupConfirmModal | The creation-step check is in `confirm_setup` only, not `start_game`; safe in practice |
| **Creation steps** (`setupSteps.ts`) | System definitions | GM, engine | The engine knows a step was asked, not whether it was asked well (by design) |
| **Campaign spine** (`gm_plan` "Campaign Plan" + `planState`) | GM `create_note`, `advance_plan` | GM every turn in full, capped (`contextLimits.ts`); plan gate; the setup card | `advance_plan` appends and never replaces, so the note grows each beat (`toolExecutor.ts:915, 944`). Beat names are preset strings (`campaignPlan.ts:36-118`). The tool description hard-codes the medium beats (`toolSchemas.ts:773`). Creation depends on a title regex |
| **Per-player arc notes** (`gm_plan`) | GM | GM every turn | Asked for, never checked; online guests receive them (§6.12) |
| **Side beats** | GM | GM | One at a time |
| **Fronts** | GM (thread + timer + plan index) | GM only | No link writer, no tick |
| **Threads** | GM; not the Designer | GM live block; Director spotlight; player ThreadsEditor | `linkedTimerId` and `threshold` unwritten; the "tick a clock" director move depends on them (`mythic.ts:663-670`) |
| **Goals** | GM; Designer `write_goals` | GM; Goals page | None found |
| **Timers** (`CountdownTimer`) | GM `manage_timer` | GM live block; a director move | **`auto_advance` never ticks**, while `gmTools.ts:473-479` still says timers "tick down automatically" |
| **Tension, chaos, tint** (`AGMTState`) | Engine at `increment_scene` | Oracle line; `selectDirectorMove` | **`storyProgress` is always 0** (`mythic.ts:384-391`), so the arc target is 2 and the arc-lag move can never fire; the progress observer prints "expected ~2/10" for every story |
| **Director moves** | Engine at `increment_scene` | GM, who must acknowledge | A pending move blocks new ones; ids use `crypto.randomUUID` |
| **Spotlight ledger** | Director Assistant (Haiku, 200 tokens) | `selectDirectorMove` | Not in the GM prompt |
| **Story progress note** | Story Progress Observer every 10 turns | GM next turn | The target is always 2 (above) |
| **NPCs** | GM; Designer `write_npcs` | GM live block; NPC page; consistency check | No visibility or secret field |
| **Lore notes by type** | Designer `write_note`; GM | GM: `dm_instructions`, `character_sheet`, `gm_plan` in full, the rest as titles | **`story_instructions` never reaches the narrator** though the Designer is told it does (§6.22); `mechanics` is not pinned |
| **Visibility** (`hidden`, `to_be_revealed`, `check_per_turn`) | GM `edit_note` | `read_notes` markers; a reveal move; a 20%-per-turn check | **`stripHiddenLoreContent` has no caller**, so hidden text reaches the narrator (§6.16); `check_per_turn` uses `Math.random` |
| **`secret` note type** | Designer, GM | GM titles | Overlaps visibility; the `secrtet` field is a typo'd duplicate |
| **Random tables** (`type: "table"`) | Designer, GM | GM by title, then `formula_roll` | Two table systems (adventure tables, Mythic tables) |
| **Pending random events** | Engine | GM live block | Capped at 5; `Date.now` / `Math.random` ids |
| **Meters and tracks** | Starters | GM tools; MetersPanel | The Designer can carry them but not author them |
| **Chapters** | Nothing | ChapterNav, the Library's "Ch. n" | Dead |

**What the starters ship.** No starter contains a campaign plan. Each relies on
the GM writing the spine in session zero. None ships timers or threads;
Hollow Hour and Grave Watcher ship meters and tracks. Wolfwillow Crossing
(Fantastic Realms) ships notes, tables and presets.

**The Designer.** Its prompt never mentions session zero or the campaign plan,
and still says lore is "pulled in by keyword" (`designer_ai.ts:33`, untrue per
§6.15). It can write a `gm_plan` note, which satisfies the campaign step
without creating `planState`.

## B. The judges and gates today (before decisions 220–221)

| Check | Detects | How | Default | On a hit | Cost per turn |
|---|---|---|---|---|---|
| `response_length` | Narration past the reply-length ceiling | A word count, then an LLM justification judge (200 tokens) | Off | Major flag; with Rewrite, a speculative shortened rewrite | 0 |
| `player_agency` | The narrator acting for the player | LLM judge | Off | Flag, or rewrite if set | 0 |
| `outcome_narration_mismatch` | Prose contradicting a typed roll tier | Typed verdicts, then an LLM judge | On, sensitivity 2 | Always "major"; flag only by default | One Haiku call on turns with a graded check |
| `missing_oracle_or_table` | An uncertain outcome decided without an oracle | LLM tool-usage judge | Off | Flag only by type | When on, a call on most turns |
| `missing_scene_increment` | A scene change without `increment_scene` | The same call | Off | Flag only | The same call |
| `tier_escalation_missed` | An under-tiered high-stakes turn | LLM judge, high-stakes turns only | Off | Flag; a full-turn retry only by a stored setting | Rare |

**The other gates:**

| Gate | What it does |
|---|---|
| **M2 roll gate** | A gated scene ending with no roll gets a re-prompt; fails open after 2. |
| **Plan gate** | A completed beat with no next beat gets a re-prompt; fails open after 2, and `awaitingNextBeat` persists into the next turn. |
| **Setup gate** | Decisions 195–196 changed its ending to the hand-back. |
| **Turn-end checks** | Blood & Bone's dawn check. |
| **Consistency check** | Deterministic, log only: a dead NPC named as present. |
| **Memory Keeper** | Every turn. |
| **Reflection** | Runs when memory importance reaches 30. |
| **Director Assistant** | Runs at each scene increment. |
| **Story Progress Observer** | Every 10 turns. |
| **Background patching** | By part id and content hash. |

## The ten biggest weaknesses (the auditor's ranking)

1. **Timers never tick, and fronts have no mechanical clock.**
2. **Hidden lore reaches the narrator, and narrator style notes never do.**
3. **`storyProgress` is always 0**, so the arc target and the arc-lag move are dead.
4. **`advance_plan` only appends**, so the pinned spine grows every beat.
5. **Campaign structure is GM-authored with no engine backstop.** No starter ships a plan, timers or threads; the Designer can't author them and says nothing of session zero.
6. **Default judge coverage was one check.** Since changed by decision 220.
7. **The plan and setup gates fail open**, and the plan state lingers.
8. **The plan's creation and length depend on a title regex**, and the beats are preset strings.
9. **Two secrecy mechanisms**, plus a typo'd duplicate field.
10. **Prompt and doc drift**: timers that "tick automatically", "keyword" lore, the deleted wizard, the hard-coded beat list, and the frontier doc's arc target.
