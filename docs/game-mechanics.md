# Game Mechanics

Your Story runs on a **GM (Game Master) tool-calling model**: instead of a
fixed dice/stat formula resolving every choice client-side, an AI acting as
GM reads the story's notes and decides in the moment whether and how to
roll, using a set of tools. There is no single "RPG system" setting - the
GM improvises dice mechanics per adventure, informed by a `mechanics` notes
entry the adventure (or its creator) can define.

This is a deliberate shift from an earlier, more mechanical version of the
app (momentum points, a picker of 8 fixed dice systems, automatic
advantage/disadvantage rolls, a point-buy stat shop, an XP/leveling
economy fed by quests and achievements, and a tiered status-condition
system). Those systems are gone. What replaced them is described below.

## Character State: Notes, Not Stat Blocks

A character's stats, personality, and mechanical quirks live in a
freeform **character sheet note** (`lore` entry of type `character_sheet`),
not in structured `Stat[]`/`Resource[]` fields. The GM reads this note (and
a `mechanics` note describing the adventure's dice conventions) instead of
consulting fixed numeric fields. This is what makes the app feel like a
tabletop GM keeping notes rather than a video game character sheet.

Some structured data still exists for systems that benefit from it:

- **Abilities** (`Ability[]`) - named skills/spells/special moves with an
  optional cost and cooldown, managed via `add_ability`, `modify_ability`,
  `upgrade_ability`, `remove_ability`, `reset_ability_cooldown`. **Soft-
  deprecated**: the tools still work for backward compatibility, but
  `buildInfoMessage` (the GM stage's own context builder, in `ai_staged.ts`)
  already treats abilities the same as stats/resources - "all mechanics
  are now defined in mechanics-type lore entries" - and the creator AI
  hasn't populated structured abilities for new adventures for some time.
  New adventures should describe abilities in the freeform character sheet
  note instead, the same as stats/resources/inventory below.
- **NPCs** (`NPC[]`) - tracked characters with status/attitude, managed via
  `add_npc`, `update_npc`, `remove_npc`, plus `npc_reaction` for toast
  notifications when an NPC's opinion shifts.
- **Story Threads** (`StoryThread[]`) - open plotlines the GM tracks and
  can open/update/resolve/abandon on its own (`create_thread`,
  `update_thread`, `resolve_thread`, `abandon_thread`). Editable manually
  in the story's Threads tab.
- **Goals** (`Goal[]`) - player-facing objectives the GM can create, update,
  complete, or fail (`create_goal`, `update_goal`, `complete_goal`,
  `fail_goal`, `delete_goal`). Editable manually in the story's Goals tab.
  Together with Story Threads, this is where the old Quests/Achievements
  systems' functionality now lives - see "What Changed" below. Status
  effects and afflictions that used to be tracked as structured
  `Condition[]` entries are now just narrative detail: describe them in the
  character sheet note, or as a `formula_roll` consequence, the same way
  the GM narrates any other consequence.

## Dice & Checks

All dice resolution goes through the GM's own tool calls - there is no
client-side "Roll + Stat ≥ DC" formula anymore. The GM looks up whatever
values are relevant in the character sheet / mechanics notes, builds a
formula, and calls one of:

- **`formula_roll`**: throw dice and report what came up. Takes
  `formulas: string[]` - one entry per *independent* pool, almost always
  just `["1d20+5"]`. Supports `stakes` (low/medium/high/deadly), per-outcome
  `consequences`, and the `target`/`forces_choice` hardness dimensions.
- **`opposed_formula`**: both sides roll (e.g. player `1d20+4` vs. NPC
  `1d20+3`) and both totals are reported.
- **`calculate`**: math expressions *and comparisons*. `'17+3 >= 15'` comes
  back as TRUE or FALSE. Also handles damage after modifiers, resource
  costs, and anything else worth showing the arithmetic for.
- **`start_challenge`**: opens a "best of X successes" challenge for
  complex, high-stakes sequences (chases, boss fights, negotiations).
  Only one challenge is active at a time.
- **`record_challenge_result`**: banks one resolved check against the active
  challenge. Rolls nothing.

### The dice tools don't judge

**No dice tool takes a DC.** They roll; `calculate` decides. So a check is
always at least two calls:

1. `formula_roll` (or `opposed_formula`, `npc_roll`, `ask_for_roll`) - the
   dice land and the numbers are reported, with no verdict attached
2. `calculate` with a comparison - `'17+3 >= 15'` → **TRUE**

Inside a challenge there's a third: `record_challenge_result` with the
outcome the comparison gave.

This split exists because "beat one target number" isn't how every system
resolves a roll. Bundling the comparison into the dice tools forced
everything through that one shape, and mangled the systems that don't fit -
Starforged's 1d6 action die was being scored as "losing" to its own 2d10
challenge dice, and a roll-under system needed a special `reverse_dc` flag
to express something a plain `'38 <= 55'` says directly. Now the mechanics
note describes the comparison in ordinary arithmetic and the GM performs it:
beat-both-dice, roll-under, degrees of success, whatever the system does.

Multiple pools follow from the same idea. `formulas: ["1d6+2", "2d10"]`
rolls an action die and two challenge dice as one handful, reports three
numbers and two separate totals, and adds nothing across them - then one
`calculate` call per target ('6 > 4' → TRUE, '6 > 8' → FALSE) gives a weak
hit. Packing those into a single `"1d6+2d10"` string would sum them into a
meaningless number.

The player never picks a "reroll" or "guarantee success" option anymore -
momentum spending is gone. If a roll should be easier or harder, that's
expressed through the formula and the target the GM chooses, informed by the
narrative and the adventure's `mechanics` note.

## Oracle & Random Tables

- **`fate_question`**: a Mythic-style yes/no oracle for resolving unknown
  facts about the world ("Is the door locked?"), weighted by likelihood
  (Impossible → Has To Be) and the story's **chaos factor** (1-9, editable
  in the Chaos/Oracle tab). Higher chaos bends the odds toward yes and
  raises the chance of a triggered Random Event. Answers are **Normal
  Yes**, **Normal No**, **Exceptional Yes**, **Exceptional No** — the
  ordinary results are named explicitly because a bare "Yes" next to
  "Exceptional Yes" reads to the model as a truncation of it, and plain
  successes were getting narrated as if the oracle had swung hard. The
  chart itself is derived from Mythic's probability ladder in
  `mythic.ts` (`fateTargetNumber`), not a hand-typed table: a 50/50
  question at chaos 5 is a literal coin flip.
- **`roll_table`**: rolls on a custom table (defined in the story's Tables
  tab) or a built-in element table (character traits, locations, plot
  twists, atmosphere, and more) for on-the-fly inspiration.

## Naming

`generate_name` exists because models have a strong attractor toward the
same handful of names (Elara, Kael, Lyra, Thorne...), and a curated name
list only postpones the problem. So the usual split is inverted: instead of
the engine producing a finished name, it rolls the **constraints** a name
has to satisfy and the GM writes a name that fits them.

Per name part it returns a **starting letter** and a **syllable count**
(binding — the GM's name must match) plus a few **seed syllables**
(inspiration only, meant to be reshaped so the name lands in the
adventure's language and genre). Rolled initials deliberately steer away
from letters already used by NPCs, combatants, world-note titles and the
characters/locations notes point at, so a campaign's cast doesn't fill up
with names sharing three initials; scaffolding notes ("Mechanics",
"Campaign Plan", the character sheet) are excluded from that scan since
their titles name nobody. When most of the alphabet is spoken for,
avoidance drops rather than squeezing every later name into the leftovers.

The GM can pass `kind` (person/place/faction/creature/object), `parts` (1-3,
covering middle names), a free-text `flavor` hint that is echoed back
untouched, and `starts_with` to lock a letter when a collision is
deliberate (a sibling of an existing NPC, a clan naming convention) —
locked letters bypass the avoidance check. The tool is read-only; the name
is recorded through `add_npc`/`create_note` like any other. Logic lives in
`app/misc/nameGenerator.ts`.

## Combat

Turn-based tactical combat is tracked via `start_combat`, `add_combatant`,
`remove_combatant`, `update_combatant_stat`, `toggle_combatant_condition`,
`npc_roll`, `advance_turn`, and `end_combat`. Combatants can be the player,
allies, or enemies with their own stat blocks (HP, AC, initiative, etc.)
independent of the player's own character sheet.

## Rest & Recovery

`take_rest` processes a quick (~30 min), short (4-8 hour), or long
(multi-day) rest: it restores resources per the adventure's rest
configuration, reduces stress, and ticks down ability cooldowns. It can't
be used while a challenge is active.

## Notes, Memory & Goals

- **Notes** (`read_notes`, `search_notes`, `create_note`, `edit_note`,
  `delete_note`, and the `edit_lore_*`/`merge_lore`/`duplicate_lore`
  family): the GM's primary way of reading and updating the world - lore,
  secrets, the character sheet, and the mechanics note all live here.
- **Memory** (`add_memory`, `search_memory`): durable recall of key past
  events, searched rather than replayed in full each turn.
- **Goals** (`create_goal`, `update_goal`, `complete_goal`, `fail_goal`,
  `delete_goal`): tracked objectives shown in the Goals tab, alongside
  Story Threads in the same Journal view. Purely narrative - completing a
  goal doesn't award any points or currency.
- **Timers** (`manage_timer`): countdown timers for deadlines/events.

## What Changed From the Old System

For reference, the following mechanics existed in an earlier version of
the app and have been removed:

- **Momentum**: a spendable metacurrency for rerolls/guaranteed success.
- **RPG System picker**: a fixed choice of 8 dice systems (3d6, 1d20,
  1d100, percentile, PbtA, Fate, YZE, Explosive) with matching
  advantage/disadvantage and DC-scaling rules baked into the client.
- **Passives**: a freestanding list of AI-grantable "passive traits" that
  never actually affected any roll or mechanic.
- **Point-buy upgrades**: spending accumulated points to directly increase
  a stat, resource max, or add a custom item.
- **Structured Stats & Resources editor**: numeric stat blocks are now
  described in the character sheet note instead of a dedicated tab.
- **Structured Inventory**: `InventoryItem[]` and its tools (`add_item`,
  `remove_item`, `modify_item`, `break_item`, `repair_item`, `damage_item`,
  `upgrade_item`, `consume_item`), the Inventory tab, and the creator's
  starting-inventory authoring UI have all been removed. Items are now
  described in the character sheet note like everything else, following
  the same pattern already used for Stats & Resources. `Choice.item_used`
  gating (predefined choices that reference a starting item) still reads
  the legacy `inventory` field on old saves/presets for backward
  compatibility.
- **Conditions**: the tiered (I-VI) status-effect system (`Condition[]`,
  `add_condition`/`upgrade_condition`/`downgrade_condition`/
  `remove_condition`/`modify_condition`) has been removed, along with the
  Conditions tab. Status effects and injuries are now purely narrative -
  the GM describes them in prose or via `formula_roll` consequences
  instead of tracking a structured tier. `game_over` no longer accepts a
  tier-6-condition path; it's gated solely on the player's combatant being
  downed (HP 0 or inactive) in active combat. This does not affect
  `toggle_combatant_condition`, the separate combat-only status-effect
  toggle used by `start_combat`/`add_combatant` (e.g. "Stunned", "Prone",
  "On Fire") - that's unchanged.
- **Achievements**: `Achievement[]` and `trigger_achievement` have been
  removed, along with the Achievements tab. Milestones are now just
  narrated, or tracked as a Goal if they're something the player should
  see progress toward.
- **Quests & XP/Leveling**: the `Quest[]` type (with its `points` field),
  `create_quest`/`update_quest`/`complete_quest`/`fail_quest`/
  `delete_quest`, and the entire XP/leveling economy (`points`, `level`,
  `upgradesSpent`, `levelingSettings`, and the per-quest/achievement/
  challenge point rewards) have been removed. Objectives are now tracked
  as **Goals** (see above) with no points attached, and Scene Challenges no
  longer award points on victory - only narrative outcomes.

If you have an older save that still has these fields, they're preserved
for backward compatibility but no longer do anything - the GM doesn't read
them, and the UI no longer exposes them.

---

_Last updated: July 2026 (Goals replace Quests/Achievements/XP; Conditions removed)_
