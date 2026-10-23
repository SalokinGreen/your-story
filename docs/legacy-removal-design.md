# Removing the arcade leftovers — design

Status: **built (decision 131) on claude/legacy-removal, 2026-10-23.** The implementation plan is
[`legacy-removal-plan.md`](legacy-removal-plan.md). Decisions 125–130 in
[`decisions.md`](decisions.md).

## 1. Why

Your Story began as an arcade RPG with a stat block, an inventory, XP and
levels, abilities with cooldowns, a shop, skill trees and New Game+. It is now
a tabletop GM that keeps freeform notes ("LLM proposes, deterministic engine
disposes"). The old systems were switched off one by one
(`five-layer-architecture-changelog.md`), but most of their code, data and
some of their screens are still there. A player meets them:

- **The character form** (decision 125). Starting *The Hollow Hour* opens a
  "Create Your Character" form that sorts Blood & Bone's sheet into arcade
  categories by guessing from field names: Heart and Power under
  "Attributes", Gear under "Equipment", and the other nineteen fields —
  including the stats Nerve, Bone, Shadow and Wits — under "Other". The
  template's own headings (Stats, Your Kind, Connections, Burdens, Assets,
  Background) are ignored. Before it, a "Choose your character" screen shows a
  single Custom card labelled "Default Stats" and "Starter Items", neither of
  which exists.
- **The Story Editor**, which lists Abilities, Variables and Relationships
  sections on every story, all empty for anything made today.
- **The GM's tools and prompt.** `take_rest` is offered and only increments
  counters on a freeform adventure; the system prompt tells the GM to call
  `request_continuation`, which it cannot call; nine unoffered tools still
  execute if a model calls one by name.

And a reader of the code meets ~9,000 lines of modules nothing live uses
(`rpgSystems.ts`, the skill trees, the ability system, the choices modal, the
export sanitiser), which every audit has to re-establish are dead.

## 2. What the player sees afterwards

- **Starting an adventure with no pre-made characters** (The Hollow Hour, most
  Designer adventures): Play → (attach notes or not) → the story opens on the
  adventure's intro and the GM starts session zero. No picker, no form
  (decisions 129, 130).
- **Session zero builds the sheet.** The GM is shown the adventure's sheet
  template for all of session zero, and fills it in
  conversation with the player — one `character_sheet` note, or one per
  player titled "Character: <name>" at a shared table — then writes the plan
  and calls `start_game`, as session zero already does for freeform stories.
  Blood & Bone's creation note already walks the GM through its eight steps.
- **An adventure with pre-made characters** still shows the picker, with the
  pre-made cards and a Custom card. Choosing a pre-made one works as today (its
  sheet becomes a note). Choosing Custom starts session zero, as above. No card
  shows stat, resource or item badges (decision 130).
- **The Story Editor** has Basic, Hot-seat, Online Play, Party Mode (desktop),
  Goals, Notes, NPCs, Threads, Chaos/Oracle and Story. Abilities, Variables and
  Relationships are gone, and the note editor loses its "turn on/off when
  variable is true" checkboxes (decision 127).
- **No game-over screen and no New Game+ banner** (decision 128). Neither can
  be reached today except by a model writing a "!!! GAME OVER !!!" marker
  nothing asks for.
- **Settings → API keys** loses the Brave Search key and the Web Research
  toggle, which only fed the unoffered `delegate_task` (decision 128).
- Nothing else changes on screen. Combat (its stat blocks and conditions are
  per-combatant and live), meters and tracks, goals, threads, the oracle,
  notes, NPCs and pictures are untouched.

## 3. Starting a story

### 3.1 The picker

`page.tsx` shows the picker when a story has no parts. It will show it only
when the adventure has at least one pre-made character
(`storyData.presets` with an id other than `"custom"`). Otherwise the story
starts as Custom does (§3.2) with no screen in between.

### 3.2 Custom without a form

Today Custom opens `CharacterCreationForm` when the template has fields, and
otherwise pushes the intro and opens the menu with a "Customize your
character" toast. Both go. Custom now always:

1. pushes the adventure's intro as the first part (as today),
2. sets `sessionZeroActive = true`, so the observer stays suspended and
   `start_game` closes setup, the same lifecycle the Hollow Hour and freeform
   stories already have,
3. saves, and leaves the player on the story with the composer focused.

**Every newly started adventure starts in session zero**, Custom or pre-made,
with a sheet or without (revised after Codex's review: a pre-made or attached
sheet with no Campaign Plan would otherwise start play with nothing asking
for the plan `start_game` requires). Designer adventures never set
`sessionZeroActive` today. A story that starts with a sheet gets the existing
START OF PLAY reminder (plan, then `start_game`); one without gets the FRESH
STORY block and the template (§3.3).

**Starting choices during session zero.** A Designer adventure's starting
choice can carry an authored opening (`intro_override`), which today skips
the GM and inserts the prose directly. While session zero is active that
shortcut is off: the choice goes to the GM as the player's action, with the
authored opening attached as "the adventure's opening for this choice,
narrate it once setup is done". After `start_game` the shortcut works as
before.

### 3.3 The GM sees the template

The GM is never told about `characterSheetTemplate` today; only the form read
it. **While the story is in session zero and the adventure has a template**,
the live block carries the template's markdown
(`characterSheetTemplate.template`) under a "CHARACTER SHEET TEMPLATE"
heading, with one instruction: build each player's sheet in this shape, fill
every field in conversation (the `| default` values are examples, not choices
made for the player), and write it with `create_note` type `character_sheet`,
titled "Character: <name>" when more than one person is playing, one per
player. It stays for all of session zero, not just until the first sheet, so
a second player at the table still gets it (Codex's review). `start_game`
ends it.

It goes in the live block, not the stable block or system prompt, because it
appears and disappears with the story's state (CLAUDE.md, the cache layout,
decision 91). The template is under ~800 tokens for Blood & Bone; it is only
present during setup, so it costs nothing in play.

The FRESH STORY block's wording ("name, starting stats/resources/abilities")
becomes "the character sheet (from the adventure's template when there is
one)".

### 3.4 Pre-made characters

A preset keeps `id`, `name`, `description`, `icon`, `characterSheet`, `intro`
and `authorNotes`, which are what the Designer's `write_presets` writes. Its
`stats`, `resources`, `inventory`, `abilities`, `relationships`, `variables`
and `npcs` fields go, with the code that copied them at story start.

## 4. What is removed

Grouped by what a reader would look for. Each item was traced by the
exploration on 2026-10-23 (the plan names files and lines).

**Screens and components.** The character creation form
(`app/story/create-character/`); the Story Editor's Abilities, Variables and
Relationships sections and their editors (`AbilitiesEditor`,
`VariablesEditor`, `RelationshipsEditor`); the note editor's variable-trigger
checkboxes; the Custom card's badges and the preset cards' stat/resource/item
badges; the game-over screen and the New Game+ banner and button; the ability
cooldown toasts; and the components nothing imports — `ChoicesModal`,
`VariablesDisplay` (`variables.tsx`), `SkillTreeEditor`, `SkillTreeView`,
`CharacterSheetEditor`, `CharacterSheetTemplateEditor`. The Brave key and the
Web Research toggle in the keys modal.

**GM tools** (decision 128). `take_rest` (offered today), and the nine
unoffered ones: `game_over`, `delegate_task`, `reaction_check`,
`negotiate_price`, `request_continuation`, `end_gm_thinking`, `add_memory`,
the five ability tools, and the state tools `update_challenge`,
`resolve_challenge`, `skip_tools`, `list_inactive_notes` and `toggle_lore`,
which no list offers either. Two live tools lose a legacy part: `end_combat`
no longer copies the player combatant's stats into structured resources
(its `sync_player_stats` parameter and that half of its description go; what
changed belongs in the sheet note), and `formula_roll` / `opposed_formula`
lose the `stat_name` parameter that fed the stat-integrity check. Each goes from all six places a tool lives
(schema, whitelist, executor, Google list, label, observer). A model that
calls one by name gets the engine's ordinary "unknown tool" answer. The
prompt line about `request_continuation` and the "keep stats, resources,
abilities current" wording go.

**Engine modules.** `rpgSystems.ts` (1,941 lines, no live caller; the eight
systems it defines were removed from play long ago), `skillTree.ts`,
`abilitySystem.ts`, the stat/resource/ability parts of `commandResponses.ts`
(its goal parts are live and stay), `adventureExport.ts` (imported nowhere),
the dead `presets.ts` helpers, `subagentExecutor.ts` and `webSearchCall.ts`
with the `/api/web-search` route, the stat-integrity cross-check inside
`formula_roll` (H8, which compares a roll against structured stats that no
longer exist), the variables prompt section and the variable lore triggers,
and the parsers that read arcade tags out of choices (`skill_used`,
`item_used`, `agmt_check`, `table`, `rolls` and the rest), with the choice
handler's branches that acted on them.

**Data** (decision 126). From `StoryData`: `stats`, `resources`, `inventory`,
`abilities`, `relationships`, `variables`, `skillTrees`, `unlockedNodes`,
`nodeEffects`, `restState`, `stress`, `maxStress`, `reverseDC`,
`upgradeSettings`, `newGamePlusCount`, `newGamePlusMode`, `gameOver`,
`pendingPlayerActions` (no writer is left), and `AGMTState.threads`; from
`ScenePart`, `gameOver`; from `Choice` and `StartingChoice`, the arcade
fields; from `StoryLore`, the variable triggers; and the types only they use
(`Stat`, `Resource`, `InventoryItem`, `Ability`, the shop and upgrade types,
`REST_CONFIG`, the DC and stat-change tiers if nothing else uses them).
**When a story loads, these keys are deleted** and the story is saved without
them on its next save. An old arcade save loses its structured stats and items
(decision 126); its notes, sheet note, NPCs, goals and history are untouched.

## 5. What stays, and why

- **Custom tables → notes.** `customTables` is read only by the migration that
  turns old tables into `table` notes (`tableNotes.ts`,
  `tablesLibraryMigration.ts`). That is a conversion, not an arcade feature:
  an old save keeps its tables as notes. The field stays as migration input
  and nothing else.
- **`ensureStoryDataArrays()`** stays and loses the legacy arrays it
  backfills. It becomes the one place that strips the removed keys on load.
- **Combat** stat blocks and `toggle_combatant_condition`, which are
  per-combatant and live.
- **Goals and Story Threads**, which replaced quests and achievements and carry
  no points.
- **The character sheet template** itself (`characterSheetTemplate`,
  `characterSheetTemplate.ts`, the Designer's `set_character_sheet_template`):
  it is now read by the GM instead of the form.

## 6. Risks

- **Older builds on another device.** Sync carries the whole story; an older
  build that opens a story saved by this one runs its own
  `ensureStoryDataArrays()` on load and backfills empty arrays, so it does not
  crash.
- **Older online guests.** A guest applies the host's snapshot as it arrives,
  with no normalisation (`page.tsx:824`), and an older build's Story Editor
  maps `resources` and spreads `relationships` unguarded. So for now the host
  adds empty legacy arrays to what it **broadcasts** (never to what it
  stores): `stats`, `resources`, `inventory`, `abilities`, `relationships`,
  `variables`. A later cleanup can drop the shim once old builds are gone.
- **Removed data coming back.** The Undo and Retry snapshots saved with a
  story still hold the old fields, and Undo restores them with
  `Object.assign` (`page.tsx:4650`). The strip runs on a restored snapshot
  too, and reaches the nested places (presets, a note's variable triggers,
  `AGMTState.threads`, a saved choice's arcade fields, `ScenePart.gameOver`),
  not only top-level keys. A synced blob from an older build is stripped when
  it is loaded, like any other.
- **Old saves mid-session-zero** with no sheet now get the template block;
  that is the intended behaviour.
- **The GM must now actually fill the template.** A model that skips the
  sheet leaves the story with no sheet; the existing setup-overdue reminder
  (`getSetupReminder`) keeps asking until `start_game`, and the observer stays
  suspended meanwhile. Whether GLM 5.3 fills Blood & Bone's sheet well is a
  live check for `pending_tests.md` (a real model run, the author's go).
- **Test count falls** by roughly 200 (the explorers counted ~190 cases that
  only cover removed code, plus parts of ~10 more). That is the intended drop;
  the plan lists the files.

## 7. Out of scope

- The iOS build's missing `App.xcworkspace` in `build-apps.yml`.
- Reworking rests as a Blood & Bone move (meters and notes already cover it).
- The Notes, NPC, Goal, Settings and Library pages moving to the `ys-*`
  tokens.
- The README, which is stale for other reasons.
