# Removing the arcade leftovers — implementation plan

Status: **approved (decision 131), being built.** Design:
[`legacy-removal-design.md`](legacy-removal-design.md). Decisions 125–130.
Branch `claude/legacy-removal`, one PR, five slices in order. Line numbers are
from `master` at 3f66c9a (2026-10-23) and will drift as slices land.

The order is chosen so the compiler does the hunting: slices 1–3 remove the
readers (screens, tools, modules), and slice 4 deletes the fields from
`structs.ts`, where `tsc` then fails on anything the earlier slices missed.
**Every slice ends with `tsc` clean and the suite green**, so a change that
only type-checks once the fields are optional (a writer that stops filling a
required field, such as `write_presets` or `DEFAULT_PRESET`) waits for
slice 4 (Codex's review).

Baseline before slice 1: Vitest 178 files / 2,727 tests, `tsc` clean, lint
counted per touched file (`verify` skill).

## Slice 1 — Starting a story (decisions 129, 130)

**`app/story/page.tsx`**
- The picker (`1446-1447`): `setShowPresetSelection(true)` only when
  `hasPremadeCharacters(storyData)`; otherwise call the Custom start directly.
  New helper in `app/misc/presets.ts`:
  `export function hasPremadeCharacters(story: Pick<StoryData, "presets">): boolean`
  (true when a preset has an id other than `"custom"`).
- `handlePresetSelect` Custom branch (`1606-1646`): delete the template/form
  branch and the dead `sourceAdventureId` refetch (`608`, `1617-1631`; the id
  is never set). Custom = `startCustomStory()`: push the intro (as
  `1712-1718`), set `sessionZeroActive: true`, save. Delete the
  "Customize your character" toast and the menu auto-open (`1740-1746`).
- Pre-made branch (`1654-1692`): keep the `characterSheet` → note and the
  `authorNotes`; delete the legacy array copies (`1676-1689`). Set
  `sessionZeroActive: true` here too: every new adventure starts in session
  zero (design §3.2).
- The starting-choice shortcut (`handleChoice`, `3588`): when
  `storyData.sessionZeroActive`, skip the `intro_override` branch and send the
  choice to the GM, with the override passed as the authored opening (a line
  in the player's turn text: "The adventure's opening for this choice, to
  narrate once setup is done: …"). After `start_game` the branch runs as
  today.
- `handleCharacterCreate` (`1124-1199`), the `CHARACTER_CREATION` state and
  its render (`5603-5608`), the `CharacterCreationForm` import (`150`): delete.
  Remove `StoryState.CHARACTER_CREATION` if nothing else uses it.
- Picker cards (`5312-5380`): delete the stat/resource/item badges
  (`5352-5364`) and Custom's hard-coded "Default Stats" / "Starter Items"
  (`5370-5375`). Custom's copy: "Build your character with the GM."
- Delete `app/story/create-character/` (`form.tsx`, 647 lines).

**`app/misc/ai_staged.ts`**
- New `buildSheetTemplateBlock(storyData)`: when
  `storyData.sessionZeroActive && storyData.characterSheetTemplate?.template`,
  returns the "CHARACTER SHEET TEMPLATE" block (design §3.3) with the
  template's markdown; else `""`. It stays for all of session zero, so every
  player at a shared table gets it. Placed in `buildLiveBlock` next to the
  setup blocks (the FRESH STORY block, `1709-1718`), never in the stable block.
- FRESH STORY text (`1714`): "name, starting stats/resources/abilities
  fitting the genre and tone" → "the character sheet — from the CHARACTER
  SHEET TEMPLATE below when there is one, otherwise fitting the genre and
  tone".

**Tests.** New `tests/storyStart.presets.test.ts`: `hasPremadeCharacters`
(no presets, only `"custom"`, one real). New `tests/sheetTemplateBlock.test.ts`:
the block appears in session zero with a template, carries the template
text, stays after a first `character_sheet` note exists, is absent after
`start_game` or with no template, and sits in the live block (the
shared-prefix test in `tests/tokenBudget.test.ts` must still pass). A Hollow
Hour story built by `startAdventureLocally` gets the block on its first GM
prompt. The story-start and starting-choice logic lives in `page.tsx`, which
has no tests; pull the two decisions out as pure helpers in `presets.ts`
(`hasPremadeCharacters`, and
`shouldUseIntroOverride(story, choice)`) so they are tested, and cover the
rest in the preview.

**Check.** Browser preview: Library → The Hollow Hour → Play → Start Without
Notes lands on the story with the intro and no picker or form; the AI
Context view shows the template block in the live message. A Designer
adventure with one preset still shows the picker; Custom there starts the
story; the pre-made card starts it with its sheet and the START OF PLAY
reminder in the AI Context. A Designer adventure with starting choices:
picking one during session zero sends it to the GM rather than inserting the
authored opening. Screenshots for the devlog.

## Slice 2 — Screens and dead components (decisions 127, 128)

**`app/story/menu.tsx`**: delete the `abilities`, `variables` and
`relationships` entries in `sections` (`250`, `254`, `255`) and their
`MenuTab` members, their render blocks (`1268-1281`, `1338-1343`,
`1345-1360`), the dead `editingStats` / `editingInventory` state (`235`,
`237`), and the restart copies of the removed fields (`820-845`).
Delete `app/story/menu/AbilitiesEditor.tsx`, `VariablesEditor.tsx`,
`RelationshipsEditor.tsx`.

**`app/story/menu/LoreEditor.tsx`** (`907-990`): delete the variable-trigger
checkboxes.

**`app/story/page.tsx`**: the game-over screen and New Game+ (`4882`,
`5090`, `5124-5268`); the cooldown toasts and the `tickCooldowns` import
(`149`, `2843`, `3423`); the restart copy at `5049-5051`; the dead
`trackPlayerAction` (`179-184`, no caller); the variable lore-trigger pass on
load (`1429`) if it only serves variables.

**Imported nowhere — delete:** `app/components/ChoicesModal.tsx` (and its
never-opened mount and `showChoicesModal` state in `story.tsx:17, 632, 1426`),
`app/story/variables.tsx`, `app/components/SkillTreeEditor.tsx`,
`SkillTreeView.tsx`, `CharacterSheetEditor.tsx`,
`CharacterSheetTemplateEditor.tsx`.

**`app/components/APIKeysModal.tsx`**: the Brave key field and the Web
Research toggle (`74`, `93`, `1055-1059`); the Brave key in
`APIKeysContext.tsx` and `syncableSettingsKeys.ts` (a stored key is left in
the player's storage, unread).

**Check.** Preview: the Story Editor's section list on The Hollow Hour; the
note editor without the trigger block; the keys modal. Screenshots.

## Slice 3 — Tools, prompt and engine modules (decision 128)

**GM tools, all six places each** (schema in `gmTools.ts`/`toolSchemas.ts`,
the whitelist in `buildGMStagePrompt` `ai_staged.ts:2014-2061`, the executor,
`GOOGLE_ESSENTIAL_TOOLS` in `providerCall.ts:188-230`, `gmToolLabels.ts`, the
observer):
- `take_rest`: `gmTools.ts:908`, `toolSchemas.ts:1067`, whitelist `2039`,
  `gmExecutor.ts:1165` and `executeTakeRest` (`2070-2225`), the dead duplicate
  `toolExecutor.ts:2830` and `executeRestTool` (`3264-3470`), label `:23`,
  `REST_CONFIG` (`structs.ts:848-895`), the `restState` reset in
  `storyCompaction.ts:346-348`.
- `request_continuation` (`gmTools.ts:1435`, `gmExecutor.ts:1270`, label
  `:77`), `end_gm_thinking` (`gmTools.ts:1478`, `gmExecutor.ts:1276`, label
  `:78`, Google entry, and the dead completion branch `generation.ts:3042-3066`;
  check it is not what §6.1's timers would tick from — it is gated on a tool
  the GM cannot call, so nothing ticks there today either),
  `reaction_check` (`gmTools.ts:2295`, `gmExecutor.ts:1399`),
  `negotiate_price` (`2371`, `1406`), `delegate_task` (`2450`, `1426`,
  `subagentExecutor.ts`, `webSearchCall.ts`, `app/api/web-search/`, the
  `webResearchEnabled` option in `generation.ts:252, 2945`).
- State tools in `toolSchemas.ts` / `toolExecutor.ts` / `TOOL_DISPATCH`:
  `game_over` (`970`, `2365`, `STATE_CHANGE_TOOLS:217`), `add_memory` (`921`,
  `699`, label `:39`, Google entry), the five ability tools (`133-320`,
  `1219`, dispatch `257-261`, the `refresh_ability` alias),
  `update_challenge` / `resolve_challenge` (`994`, `1021`, `2441`, `2547`),
  `skip_tools`, `list_inactive_notes`, `toggle_lore` (`952`, `397`, `548`,
  `685`, `756`, `1584`).
- Fix the stale comment at `gmExecutor.ts:1435`.
- `end_combat` stays, but its resource bridge goes: the copy of the player
  combatant's stats into `resources` (`gmExecutor.ts:5310`), the
  `sync_player_stats` parameter (`gmTools.ts:1910`, `structs.ts:484`) and
  "copy the player's stats back to matching character resources" in its
  description (`gmTools.ts:1897`). The description says to record lasting
  changes in the sheet note instead.
- The `stat_name` parameter of `formula_roll` / `opposed_formula`, which only
  fed H8 (`gmTools.ts:84, 153, 990, 1189`), goes with H8.

**Prompt text** (`ai_staged.ts`): delete the `request_continuation` line
(`1834`); "keep stats, resources, abilities current" (`1899`) and the
CHARACTER SHEET header's "abilities, resources" (`1426`) become sheet-note
wording; the variables section (`867-870`) goes. The BAD examples in the
choices prompt (`998-1015`) stay — they tell the model not to write arcade
tags.

**Modules.**
- `rpgSystems.ts`: delete, with the unused imports and the uncalled
  `parseDifficulty` in `gmExecutor.ts:158-164, 775`.
- `skillTree.ts`, `abilitySystem.ts`, `adventureExport.ts`: delete.
- `commandResponses.ts`: delete the stat, resource and ability handlers
  (`339-693` range); keep the goal handlers and their dispatch.
- `presets.ts`: delete `createPresetFromCurrentSettings`, `applyPreset`,
  `getPresetById` (`DEFAULT_PRESET` loses its legacy arrays in slice 4, with
  the type).
- `mythicChaos.ts`: delete `migrateItemGrades` and its call (`page.tsx:1406`).
- The stat-integrity check H8 (`gmExecutor.ts:2295-2304`, calls at `2554`,
  `2920`): delete.
- Variables: `lore.ts:29-36` `checkVarTriggers` and its use.
- Choice parsing: `parseChoices` (`generation.ts:751-870`) and
  `outputToScenePart` (`ai.ts:274-380`) stop reading the arcade tags and the
  "!!! GAME OVER !!!" marker (`ai.ts:422-435`); the choice handler's
  `agmt_check` / `table` / `custom_table` / `rolls` branches
  (`page.tsx:3668-3760`) go. A model that still writes a tag gets it left in
  the choice text, as any other unparsed text is.

**Tests to delete** (only cover removed code): `rpgSystems.core` (67),
`rpgSystems.explosive` (33), `rpgSystems.yze` (30), `advantageStacking` (16),
`subagentExecutor` (7), `gmTools.reactionCheck` (8), `gmTools.negotiatePrice`
(5), `toolExecution.addMemory` (7), `gmTools.statIntegrity` (7). **To trim:**
`advanced.commands` (the Resource and Stat sections), `toolExecutor.dispatchTable`
(the ability cases), `gmTools.challengeParity` (`reverseDC`), any `take_rest`
cases, `toolExecution.test.ts` (its mixed execution and error tests call
`add_memory` at `217` and `game_over` at `366`: swap in a kept tool so the
coverage survives), `gmToolLabels.test.ts:9` (expects a removed label), and
the `end_combat` tests that assert the stat sync. **To add:** one test that every name in the GM whitelist has a schema
and an executor and nothing outside it is in `GOOGLE_ESSENTIAL_TOOLS` or the
labels (the six-places drift check), and one that a call to a removed name
returns the unknown-tool result.

**Check.** `engine-review` on the slice (it changes `app/misc/`).
`tests/toolBudget.test.ts` must still pass, and the tool list shrinks
(`take_rest`'s schema leaves it).

## Slice 4 — The data model (decision 126)

**`app/misc/structs.ts`**: delete the fields and types listed in design §4
(`StoryData` `1079-1087`, `1118-1126`, `1140-1141`, `1164`, `1169-1177`;
`AGMTState.threads` `1229`; `ScenePart.gameOver` `435`; the `Choice` arcade
fields `497-526` and `StartingChoice`'s `1539-1550`; `StoryLore.var_on_triggers`
/ `var_off_triggers` `230-231`; `Preset` `823-829`; `Stat`, `Resource`,
`InventoryItem`, `Ability`, `AbilityCost`, `Relationship`, `Variable` and its
kinds, the shop and upgrade types `1393-1460`, `DEFAULT_UPGRADE_SETTINGS`,
`UPGRADE_COSTS`, `STARTING_UPGRADES_BY_DIFFICULTY`, `AGMTThread`, the DC and
stat-change tiers and `ItemGrade` when `tsc` shows nothing else uses them).
`customTables` stays, commented as migration input only (design §5).

**`app/misc/storyDataDefaults.ts`**: `ensureStoryDataArrays()` stops
backfilling the removed arrays (`22-29`) and first calls
`stripRemovedFields(story)`, which deletes the removed top-level keys
(`REMOVED_STORY_FIELDS`) and the nested ones: each preset's legacy arrays,
each note's `var_on_triggers` / `var_off_triggers`, `agmtState.threads`, each
scene part's `gameOver` and its choices' arcade fields, and the same on
`starting_choices`. It already runs on every load (`localStoryManager.ts:196`,
`page.tsx:1413`); synced blobs are stripped on that load too.

**Undo and Retry.** `getUndoStack()` (`localStoryManager.ts:594`) returns
old snapshots, and Undo restores one with `Object.assign` (`page.tsx:4650`):
run `stripRemovedFields` on the snapshot before it is applied.

**Older online guests.** The host's snapshot broadcast gets
`withLegacyGuestShim(story)`: a copy with empty `stats`, `resources`,
`inventory`, `abilities`, `relationships` and `variables`, so an older
guest's Story Editor does not crash (design §6). Only the broadcast copy;
the host's own story stays stripped. A new guest strips it on receive
(`onSnapshot`, `page.tsx:824`, through `ensureStoryDataArrays`).

**`designer_executor.ts`** `write_presets` (`478-515`) and `DEFAULT_PRESET`
stop writing the legacy arrays. **`localStoryManager.ts`** (`419-425`,
`471-477`) stops writing them.

Then `tsc`, and fix every remaining reader it names (expected: none that
slices 1–3 did not already remove; anything it finds is listed in the
decisions-made section below).

**Tests.** New `tests/storyDataDefaults.stripRemoved.test.ts`: an old arcade
save with every removed key loads without them, keeps its notes, sheet,
NPCs, goals, scene parts and `customTables` (which the table migration then
converts); a save without them is unchanged; the nested fields go;
load → Undo restores a snapshot without them; `withLegacyGuestShim` adds the
empty arrays to the copy and leaves the original untouched. Update
`tests/designerAdventureStart.test.ts:123-164` (it asserts the arrays are
saved) and any fixture that builds a `StoryData` with the removed fields.

**Check.** The standalone build (`node scripts/build-standalone.mjs`), since
storage and sync shapes move. Load an old save in the preview (the existing
"Inventory Crash Repro" story in the dev library is one) and confirm it opens
and plays to the composer.

## Slice 5 — Docs

- `CLAUDE.md`: "Removed or deprecated systems" becomes "Removed" with the
  shorter list; the "Executors that exist but are not offered" paragraph goes;
  `take_rest` leaves the tool list; the directory map loses the deleted
  modules; the Designer bullet's "carries none of the legacy arrays" becomes
  true.
- `docs/game-mechanics.md` "What Changed": the dated removal.
- `docs/status-report-2026-10-20.md`: a dated update note under §6.10 (the
  unoffered tools are deleted, not re-offered).
- `docs/pending_tests.md`: a real session-zero run of The Hollow Hour on the
  default ladder (needs the author's go): the GM should fill every field of
  the template in conversation and write one `character_sheet` note before
  `start_game`; failure looks like a sheet with the template's example
  defaults, or `start_game` with no sheet.
- Both docs here marked built; the devlog
  `docs/devlog/2026-10-23-legacy-removal.md` with the slice 1 and 2
  screenshots.

## What breaks, and for whom

- Old arcade saves lose structured stats, resources, inventory, abilities,
  relationships, variables and skill trees on load (decision 126).
- A saved choice with an arcade tag plays as a plain choice.
- A player's stored Brave key and Web Research setting stay in local storage,
  unread.
- An older build on another device opening a synced story backfills empty
  arrays itself and keeps working.

## Codex's review (2026-10-23)

Codex (gpt-6.1-sol, high) reviewed the first draft against the code. All
eight findings were checked and seven taken in, above: older online guests
crashing on missing arrays (the broadcast shim); slice 1 not type-checking
before slice 4 (writers moved to slice 4, `tsc` after every slice); an
adventure with a sheet but no plan never asked for `start_game` (every new
adventure starts in session zero); the template vanishing after the first
player's sheet (it stays for all of session zero); starting choices skipping
session zero (the shortcut waits for `start_game`); Undo restoring removed
fields and nested fields escaping a top-level strip; `end_combat`'s resource
bridge and H8's `stat_name` parameter; and the missing test updates. Not
taken: tracking which players still lack a sheet and gating `start_game` on
it. That is new party-mode behaviour rather than removal; the template
staying up for all of session zero covers the gap this change opens.

## Decisions made during implementation

### 2026-10-23, slice 1

- **Auto-start is a ref plus an effect, not a direct call.** The load effect
  runs before `storyData` state exists, and `handlePresetSelect` reads state,
  so `setupUIFromStory` sets `startCustomPendingRef` and an effect on
  `[storyData, storyDbId]` calls `handlePresetSelect(DEFAULT_PRESET)` once
  both are set. (A state flag would have added a `set-state-in-effect` lint
  error.)
- **Starting-choice text.** The override line is added to the player's turn
  text through `flavorLines` in `handleChoice`, so it shows in the stored
  player part like the oracle and table lines do.
- **`shouldUseIntroOverride` takes `Pick<Choice, "text" | "intro_override">`**
  and `page.tsx` also tests `choice.intro_override` itself, because the helper
  is not a type guard.
- **`DEFAULT_PRESET.description`** is now "Build your character with the GM."
  (the picker card reads it); its other fields wait for slice 4.
- `sourceAdventureId` state stays: the restart and New Game paths still read
  it (slice 2 removes those). Only the dead template refetch went.
- `selectedPreset` state went too (its only reader was the deleted form).


### 2026-10-23, slice 2

- **The game-over screen took the Replay and New Game+ flows with it**, and
  with them page.tsx's own restart copy of the removed fields. The story
  menu's Restart (menu.tsx) is now the only restart path; it keeps
  `agmtState`, `customTables` (migration input) and `restState` (slice 3 removes
  it with `take_rest`) and drops the copies of stats, resources, inventory,
  abilities, relationships, variables, skill trees, unlocked nodes and
  `newGamePlusMode`.
- **Also deleted in menu.tsx:** `editingResources` (dead like the other two).
- **`processLoreTriggers` stays** (keyword triggers); the variable-specific
  `checkVarTriggers` is slice 3's. LoreEditor's read-only "Vars turning
  ON/OFF" badges went with the checkboxes, and its `variables` prop with them.
- **Brave key and Web Research:** removed from the keys modal, `APIKeysContext`
  and the synced-settings list (`webResearchEnabled`); `page.tsx` no longer reads
  either or passes them to generation. The optional `webResearchEnabled` and
  `braveSearchKey` fields on the generation options and the sub-agent context
  stay for slice 3 (`delegate_task`). `tests/sideModelCall.test.ts` still passes
  a `braveSearchKey` in a fixture; harmless, left.
- **story.tsx:** with the ChoicesModal mount gone, its feeders (`handleChoice`,
  `onCommentSubmit`, `onRerollChoices`, `input`, `handleSelect` destructures,
  `selectedChoice`, `handleSelectChoice`, `setActionMode`) were unused and
  removed so the file's lint count does not rise. The props stay on `StoryProps`
  (page.tsx still passes them); trimming them is not worth a page.tsx churn.
- No test changed: the suite stays at 180 files / 2,740 tests.
