# Game Mechanics

Your Story runs on a **GM (Game Master) tool-calling model**: instead of a
fixed dice/stat formula resolving every choice client-side, an AI acting as
GM reads the story's notes and decides in the moment whether and how to
roll, using a set of tools. There is no single "RPG system" setting - the
GM improvises dice mechanics per adventure, informed by a `mechanics` notes
entry the adventure (or its creator) can define.

This is a deliberate shift from an earlier, more mechanical version of the
app (momentum points, a picker of 8 fixed dice systems, automatic
advantage/disadvantage rolls, a point-buy stat shop). Those systems are
gone. What replaced them is described below.

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
  `upgrade_ability`, `remove_ability`, `reset_ability_cooldown`.
- **Conditions** (`Condition[]`) - status effects/afflictions with tiers,
  managed via `add_condition`, `upgrade_condition`, `downgrade_condition`,
  `remove_condition`.
- **NPCs** (`NPC[]`) - tracked characters with status/attitude, managed via
  `add_npc`, `update_npc`, `remove_npc`, plus `npc_reaction` for toast
  notifications when an NPC's opinion shifts.
- **Story Threads** (`StoryThread[]`) - open plotlines the GM tracks and
  can open/update/resolve/abandon on its own (`create_thread`,
  `update_thread`, `resolve_thread`, `abandon_thread`). Editable manually
  in the story's Threads tab.

## Dice & Checks

All dice resolution goes through the GM's own tool calls - there is no
client-side "Roll + Stat ≥ DC" formula anymore. The GM looks up whatever
values are relevant in the character sheet / mechanics notes, builds a
formula, and calls one of:

- **`formula_roll`**: roll a formula (e.g. `1d20+5`) against an optional
  DC. Supports `reverse_dc` for roll-under systems (Call of Cthulhu/BRP
  style), `stakes` (low/medium/high/deadly), and per-outcome
  `consequences`.
- **`opposed_formula`**: both sides roll (e.g. player `1d20+4` vs. NPC
  `1d20+3`), higher wins.
- **`formula_challenge_check`**: a roll that contributes to an active
  multi-roll challenge (see below).
- **`start_challenge`**: opens a "best of X successes" challenge for
  complex, high-stakes sequences (chases, boss fights, negotiations).
  Only one challenge is active at a time; checks against it use
  `formula_challenge_check` until it resolves or is cancelled.
- **`calculate`**: general math/dice expressions (damage after modifiers,
  resource costs) with an explanation.

The player never picks a "reroll" or "guarantee success" option anymore -
momentum spending is gone. If a roll should be easier or harder, that's
expressed through the formula or DC the GM chooses, informed by the
narrative and the adventure's `mechanics` note.

## Oracle & Random Tables

- **`fate_question`**: a Mythic-style yes/no oracle for resolving unknown
  facts about the world ("Is the door locked?"), weighted by likelihood
  (Impossible → Has To Be) and the story's **chaos factor** (1-9, editable
  in the Chaos/Oracle tab). Higher chaos means more unexpected answers and
  a higher chance of a triggered Random Event.
- **`roll_table`**: rolls on a custom table (defined in the story's Tables
  tab) or a built-in element table (character traits, locations, plot
  twists, atmosphere, and more) for on-the-fly inspiration.

## Combat

Turn-based tactical combat is tracked via `start_combat`, `add_combatant`,
`remove_combatant`, `update_combatant_stat`, `toggle_combatant_condition`,
`npc_roll`, `advance_turn`, and `end_combat`. Combatants can be the player,
allies, or enemies with their own stat blocks (HP, AC, initiative, etc.)
independent of the player's own character sheet.

## Rest & Recovery

`take_rest` processes a quick (~30 min), short (4-8 hour), or long
(multi-day) rest: it restores resources per the adventure's rest
configuration, reduces stress, and ticks down ability cooldowns and
condition durations. It can't be used while a challenge is active.

## Notes, Memory & Quests

- **Notes** (`read_notes`, `search_notes`, `create_note`, `edit_note`,
  `delete_note`, and the `edit_lore_*`/`merge_lore`/`duplicate_lore`
  family): the GM's primary way of reading and updating the world - lore,
  secrets, the character sheet, and the mechanics note all live here.
- **Memory** (`add_memory`, `search_memory`): durable recall of key past
  events, searched rather than replayed in full each turn.
- **Quests** (`create_quest`, `update_quest`, `complete_quest`,
  `fail_quest`, `delete_quest`): tracked objectives shown in the Quests
  tab; completing one still awards XP (`points`) toward the character's
  level.
- **Achievements** (`trigger_achievement`): milestone unlocks with a
  player-facing description and an optional `ai_hint` for precise
  triggering conditions.
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

If you have an older save that still has these fields, they're preserved
for backward compatibility but no longer do anything - the GM doesn't read
them, and the UI no longer exposes them.

---

_Last updated: July 2026_
