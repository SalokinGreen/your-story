# The reading themes reach the whole app — implementation plan

Status: **approved (decision 141), revised after Codex's review, being
built.** Design: [`whole-app-themes-design.md`](whole-app-themes-design.md).
Decisions 137–141. Branch `claude/whole-app-themes`, one PR, six slices.

Counts come from the 2026-10-23 survey on `master` at 69dad7e. They are
grep occurrences of hard-coded colour classes, red, green and amber
included, so they are upper bounds.

**Every slice ends with the same checks:**
- `tsc` clean and the suite green;
- the web build, and `node scripts/build-standalone.mjs`;
- screenshots in Ink and in Paper White of each screen it converted,
  taken in the browser preview by setting `localStorage.storyTheme` to
  `ink`, then `paper`, and reloading;
- the slice's files added to the ratchet list.

**Every slice starts with a dependency inventory.** It lists the shared
shells, wrappers and data modules its screens render through, and any that
are not yet converted move into the slice. Codex's example: Settings renders
inside `FullScreenView`, whose own background and header are hard-coded.

Baseline: Vitest 179 files / 2,595 tests, `tsc` clean, lint counted per
touched file.

**The mapping every slice applies** (design §3). Where the mapping reads
wrong in Paper White, judgement wins.

| today | becomes |
|---|---|
| page backgrounds: `bg-gray-900/950`, `bg-slate-900`, `from-gray-900 via-blue-950 to-purple-950` | `bg-ys-bg`; on the three gradient surfaces, `bg-[image:var(--ys-gradient)]` (never `bg-(--ys-gradient)`, which emits a `background-color`) |
| cards and panels: `bg-gray-800`, `bg-white/5`, `bg-black/30` | `ys-card` or `bg-ys-surface` |
| hover, selected, inputs on a card: `bg-gray-700`, `bg-white/10` | `bg-ys-surface-2` |
| borders: `border-gray-700/800`, `border-white/10` | `border-ys-border` |
| body text: `text-white`, `text-gray-100/200` | `text-ys-text` |
| secondary text: `text-gray-400/500` | `text-ys-muted` |
| brand and active: `purple-*`, `blue-*`, `indigo-*`, `violet-*`, `pink-*` and the other hues | `text-ys-accent`, or `bg-ys-accent` with `text-ys-on-accent`, or `ys-button--primary` |
| meaning: `red-*`, `green-*`, `amber-*`/`yellow-*` | `ys-danger` / `ys-success` / `ys-warning` (fills at `/15`; Codex checked that `@theme inline` and the opacity modifier produce working `color-mix`) |
| modal overlay: `bg-black/50..80` | `ys-modal-backdrop` |
| `prose-invert` | removed; prose reads the theme-backed `--tw-prose-*` |

## Slice 1 — The foundation and the shared shells

### Tokens (`app/story/themeTokens.ts`)

- `ThemeTokens` gains `surface2`, `onAccent`, `danger`, `success`,
  `warning`, `gradient`, and `scheme: "dark" | "light"`.
- New `isLightTheme(preset)`: true when the background's relative luminance
  is over 0.5.
- `onAccent` is bg or text, whichever has more contrast against the accent.
  If neither reaches 4.5:1, it is near-black (`#111`) or near-white
  (`#fafafa`), whichever is higher. A preset may name its own.
- Sepia and Nord name their own `muted`, so it reaches 4.5:1 against
  surface. Ink names `surface2` (`#262626`), so the story screen does not
  shift.
- `THEME_PRESETS` and `applyThemeVars(preset)` move here from
  `FontSettingsTab.tsx`. `applyThemeVars`:
  - sets every token, `color-scheme` on `<html>`, and the `theme-color`
    meta;
  - keeps writing the three old `--story-*` vars for older synced devices.

### Runtime ownership

Colours apply in one place, from the saved theme only.

- `FontSettingsTab.tsx` (around `245`) has an apply effect that runs with
  the initial Ink state before the load effect has read the saved theme.
  The fix: it applies only once the settings have loaded.
- `initializeFonts` (around `809`) waits on IndexedDB before applying the
  colours. The colour part moves out to `applyThemeVars`, run immediately.
- `FontInitializer` subscribes to `storage` events, and to the sync
  manager's completion (`syncManager.ts` around `580` and `730`), so a theme
  changed in another tab, or synced in, re-applies.

### The bootstrap

- `app/misc/themeBootstrap.ts` exports the script as a string. It is built
  from the same preset list and mixing functions, serialised.
- `app/layout.tsx` renders it as a plain synchronous
  `<script dangerouslySetInnerHTML>` inside `<head>`. It is **not**
  `next/script`: `beforeInteractive` queues inline content through
  `__next_s` and does not run before paint.
- The script reads `storyTheme`, finds the preset, and sets the tokens and
  `color-scheme`. On missing storage, an unknown id, a blocked
  `localStorage` or any throw, it falls back to Ink.
- `<html>` keeps its existing `suppressHydrationWarning`.

### `app/globals.css`

- **Tokens.** `:root` holds Ink's values for every token. `@theme inline`
  adds `--color-ys-surface-2`, `-on-accent`, `-danger`, `-success` and
  `-warning`.
- **Page.** `body` reads `var(--ys-bg)` / `var(--ys-text)`. The OS media
  query and `--background` / `--foreground` are deleted; first grep that
  nothing else reads them. `.fade-edge-right`, at about `384`, reads
  `--background` and moves to `--ys-bg`.
- **Unlayered global rules**, which override layered classes:
  - the select arrows, the purple focus and hover, the dark `option`, and
    the `!important` selected background (around `265`): all to tokens;
  - `.focus-ring` (around `371`): to the accent.
- **Scrollbars** (the author, 2026-10-23: "the theme doesn't change scroll
  bars"). Today the `::-webkit-scrollbar*` rules (around `217–251`) and
  `scrollbar-color` (around `255–261`) hard-code purple `#667eea`/`#764ba2`
  thumbs on `#f1f1f1`/`#1a1a1a`, switched by the OS. They become a thumb of
  `var(--ys-border)` (hover `var(--ys-muted)`) on a transparent track, with
  no media query. `color-scheme` covers the native scrollbars that are
  left. The two Tailwind `scrollbar-thumb-*` uses go with their files in
  slice 3.
- **Prose.** The typography plugin's colours come from the theme: one rule
  sets `--tw-prose-body`, `-headings`, `-links`, `-bold`, `-counters`,
  `-bullets`, `-hr`, `-quotes`, `-quote-borders`, `-captions`, `-code`,
  `-pre-code`, `-pre-bg`, `-th-borders` and `-td-borders` from the
  tokens. The `-invert-*` set gets the same values. `.prose a` and its
  hover take the accent, underlined. `prettify`'s inline colour in
  `StoryTurn.tsx` stays.
- **Component classes**, in `@layer components`: `ys-card`, `ys-input`
  (including `select` and `option`), `ys-button` with `--primary`, `--ghost`
  and `--danger`, `ys-chip`, `ys-modal-backdrop` and `ys-modal`.

### The shared shells, converted here, before any consumer

- `FullScreenView.tsx`: its background and header (around `77–80`).
- `ConfirmDialog` (already on tokens; check it).
- `LoadingButton`, `Skeleton` and `ModelSelect`, if their inventory shows
  colours.
- `NotificationContainer.tsx`: the `dark:` variants go, and it takes the
  meaning tokens.
- `FontSettingsTab.tsx` imports the moved pieces. Its swatches stay
  literal.

### Tests

- **`tests/themeTokens.test.ts`.** Update its import (line 2) and its
  exact object assertion (line 31). Then, for every preset:
  - text, muted and accent reach 4.5:1 against bg, surface and surface-2;
  - **onAccent reaches 4.5:1 against accent**;
  - danger, success and warning reach 4.5:1 against bg and surface, and
    as text on their own `/15` fill composited over bg;
  - `isLightTheme` is true only for Paper White.
- **`tests/themeBootstrap.test.ts`:**
  - the script's tokens equal `themeTokens()` for every preset, by
    evaluating it against a fake `document` and `localStorage`;
  - a missing, unknown or corrupt value, or a throwing `localStorage`,
    gives Ink.
- **`tests/themeTokensOnly.test.ts`**, the ratchet:
  - it tokenises every string literal and template piece in each listed
    file;
  - it checks each class-like token against every Tailwind colour family,
    plus `bg-/text-white/black`, colour stops and `dark:`;
  - it checks inline `style` colour values and SVG `fill` / `stroke`;
  - fixtures make sure "history" and "grayed" pass and `cn("bg-gray-800")`
    fails;
  - the list starts with `globals.css` (checked for hex outside `:root`)
    and slice 1's files;
  - a second case fails when a `.tsx` file in `app/` is in neither the list
    nor the exempt list, so a new file must choose. That case is
    `skip`-ped until slice 5, when everything is listed.

### Check

- The story screen in Ink is unchanged, judged by eye against a before
  screenshot.
- **Paper White:** no dark first frame on reload with the network
  throttled, a light body, light scrollbars (the Story Editor, a long
  story), selects and options readable, and toasts in both themes.
- The exported `out/` HTML has the script inline in `<head>`, and the
  console shows no hydration warnings.
- Switching the theme in Settings repaints every open screen without a
  reload.

## Slice 2 — Settings

- **Files:** `APIKeysModal.tsx` (122), `AIConfigTab.tsx` (101),
  `FontSettingsTab.tsx` (55, not its swatches), `TurnCostPanel.tsx` (40),
  `SamplingSettingsTab.tsx` (40), `ArchitectureSettingsTab.tsx` (36),
  `SyncTab.tsx` (30), `ImageSettingsTab.tsx` (21),
  `ClaudeSubscriptionPanel.tsx` (13) and `InfoTabs.tsx` (15).
- **Watch for** the class constants and the `cn()` branches, for example
  `APIKeysModal.tsx:119`.
- **Check:** every tab in Ink and in Paper White. The inputs, the model
  pickers and the cost table must be readable in both.

## Slice 3 — The story's own sub-pages

- **First, `app/misc/noteMentions.ts` (around `21`).** Decide each colour:
  note types are categories, not danger or success. They map to accent,
  muted and a small set of named category tokens, or are exempt with the
  reason recorded.
- **Files:**
  - `lore.tsx` (Notes, 137), `npcs.tsx` (116) and `goals.tsx` (66);
  - `menu.tsx` (92) and `menu/*`: `LoreEditor` 83, `NPCEditor` 49,
    `BasicSettings` 43, `OnlinePlayEditor` 31, `GoalEditor` 27,
    `CompactStoryModal` 27, `ThreadsEditor` 23, and the rest under 15
    each;
  - `MetersPanel.tsx` (22), `ContextViewer.tsx` (173) and `LogViewer.tsx`
    (19);
  - what is left in `page.tsx` (38) and `story.tsx`;
  - `PlayerBubbles.tsx`'s inline chrome colours (around `586`). The player
    colours themselves stay.
- **Roles and stages in the context and log viewers.** These are built in
  helpers (`ContextViewer.tsx:516`):
  - system → muted;
  - user → text;
  - the GM → accent;
  - tool → surface-2 with an accent border;
  - errors → danger;
  - warnings → warning.
- **Dice tray.** Its canvas and material colours stay. Its result labels
  and surfaces are checked in Paper White.
- **Check**, each in Ink and in Paper White: Notes, NPCs, Goals, every
  section of the Story Editor, AI Context with a real stored turn, the Logs,
  combat and the dice tray.

## Slice 4 — Library and Designer

- **Files:**
  - `app/library/*`: `NotesLibraryTab` 65 (its per-folder inline colours
    at `749` stay; the chrome around them converts), `StoriesLibraryTab`
    36, `AdventuresLibraryTab` 27, `LibraryHome` 18, `BuiltinSystemsSection`
    13, `FolderDetailView` and the rest;
  - the Library dialogs: `NewFolderDialog`, `FolderActionSheet`,
    `ExportFolderModal`, `JoinGameModal` (14) and `HostGameModal` (13);
  - `app/creator/*`: `AdventureInspector` 57, `page.tsx` 26, and
    `DesignerChat` 18, whose `prose-invert` goes (`88`).
- **The gradient.** The Library background takes `--ys-gradient` as
  `bg-[image:var(--ys-gradient)]` (decision 139).
- **Check**, each in Ink and in Paper White: the Library home, a folder,
  each tab, the dialogs, and the Designer with a draft open.

## Slice 5 — Everything else, and the party picker

- **Files:**
  - the PDF importer, `PDFImporter.tsx` (152), and `pdf-import/*`
    (`NotePreviewCard` 31, `ExtractionPreview` 13);
  - `GuidedStoryStart.tsx` (80, including its inline chrome colours,
    around `436`);
  - the pickers and generators: `ProfilePickerModal` 33,
    `LibraryPickerModal` 29, `ClockCategorySelector` 28, `IconPicker` 25,
    `MassLoreImageGenerator` 22 and `IconAttribution` 16;
  - the page frame, which takes `--ys-gradient`: `SiteHeader.tsx` (17) and
    `app/page.tsx` (65, home);
  - `app/terms/page.tsx` (35) and `app/privacy/page.tsx` (32).
- **The party phone page.**
  - `PartyController.tsx` (44): its classes, its inline styles (around
    `65`) and its SVG `fill` / `stroke` (around `434`) move to the tokens.
  - The player colours stay, and so does the QR code's black and white
    (`PartyLobby.tsx:111`).
  - It gains a small **theme picker** (decision 140, the swatches),
    writing that phone's own `storyTheme`.
- **The sweep.** Grep `app/` for anything left. Each file still holding a
  hard-coded colour is converted, or exempted with its reason in the
  slice's "Decisions made" entry. Then the ratchet's "every `.tsx` is
  listed or exempt" case is un-skipped.
- **Check**, each in Ink and in Paper White:
  - the home page;
  - the PDF importer through a preview;
  - the freeform start wizard and the pickers;
  - the party page at phone width in the preview, including its picker
    persisting across a reload.

  A real phone over the LAN origin goes in `pending_tests.md`, since the
  preview cannot prove persistence on the phone.

## Slice 6 — Docs

- **`CLAUDE.md` Conventions:**
  - "The story screen's colours are the `ys-*` tokens" becomes "every
    screen's", with the new tokens and the component classes listed;
  - "The Notes, NPC, Goal, Settings and Library pages have not moved to the
    tokens yet." is dropped;
  - two lines are added: "a new `.tsx` file joins
    `tests/themeTokensOnly.test.ts` or its exempt list", and "the theme
    bootstrap mirrors `themeTokens()`; change both".
- **`docs/story-screen-design.md`:** a dated note that the tokens now cover
  the whole app.
- **`docs/pending_tests.md`**, three checks:
  - the desktop app and the APK in Paper White: title or status bar colour,
    native scrollbars (WebView2 and Android WebView), and no dark flash on
    launch;
  - on iOS, the overlay scrollbars;
  - the party page's picker on a real phone.
- **The devlog**, with before and after pairs per area, in Ink and in Paper
  White.
- **Both docs** are marked built.

## What breaks, and for whom

- Nobody's data or settings: the same key and the same presets, with Ink
  the default.
- A player on a dark OS who never picked a theme saw Ink on the story
  screen and the OS-dark grey elsewhere. They now see Ink everywhere.
- Ocean Blue (`default`) players now see it everywhere, as decision 137
  asks.

## Codex's review (2026-10-23)

Codex (gpt-6.1-sol, high) found ten problems. All were checked and taken
in:

1. The `onAccent` derivation failed three presets (about 4.0:1), and the
   test checked the wrong pair. Now there is a black/white fallback, and
   on-accent is tested against accent, along with surface-2 and the meaning
   fills. Sepia's and Nord's muted are fixed.
2. Unlayered global rules would keep Paper White's controls dark. They are
   converted in slice 1: the select and option rules, `.focus-ring` and
   `.fade-edge-right`.
3. The bootstrap mechanism was not specified. It is now a synchronous
   inline script in `<head>`, not `next/script`, and `<html>` keeps
   `suppressHydrationWarning`. The exported HTML and the console are
   checked.
4. The typography plugin was not themed. It now has theme-backed
   `--tw-prose-*`, and `prose-invert` goes.
5. Shared shells came after their consumers. `FullScreenView` and the other
   shells move to slice 1, each slice starts with a dependency inventory,
   and `noteMentions` comes first in slice 3.
6. The ratchet regex was too blunt. It now tokenises, covers every colour
   family, checks inline styles and SVG, has fixtures, and fails on an
   unlisted file.
7. Runtime ownership was split: the picker applied Ink early, fonts gated
   the colours, and there was no re-apply. Colours now apply in one place
   and re-apply on storage and sync. (`story.tsx` only reads the theme and
   does not fight it.)
8. The party phones had no way to pick a theme. They get a small picker,
   and the real-phone check goes in pending tests.
9. Inline and SVG colours, and the fixed-palette limits, were not covered.
   Each is now named: folder colours, the QR code, dice, player colours,
   the inline chrome.
10. Gradient syntax and verification. `bg-[image:…]` is used, the moved
    import and assertion are updated, and the web build, bootstrap and
    hydration checks are added, along with scrollbars across WebView2,
    Android and iOS.

## Decisions made during implementation

(Filled in as slices land.)

### Slice 1 — 2026-10-23

**Dependency inventory.** The shells slice 1's consumers render through:
`FullScreenView` (Settings, Notes, NPCs, menus, PDF importer, pickers; its
background, header, tab strip, side nav and footer converted), `ConfirmDialog`
(backdrop and card now `ys-modal-backdrop` / `ys-modal`), `LoadingButton`,
`Skeleton`, `ModelSelect` and `NotificationContainer` (all converted, none
was already clean). `FontSettingsTab` holds colours too, but they are slice 2's
and its swatches. Not in the slice, found while inventorying: callers of
`ConfirmDialog` still pass `confirmButtonClass="bg-red-600 …"` (Library tabs,
slice 4); the dialog now reads any value as "destructive" and ignores the
string.

**Judgment calls.**
- *Accent contrast.* The plan asks for accent at 4.5:1 on bg, surface and
  surface-2. The presets cannot meet that without new accents (Ocean Blue is
  4.0 on bg, Forest 3.5, Solarized 4.1), which would change the story screen.
  The test keeps the old floor, 3:1, on bg and surface; on surface-2 (hover
  only) Ocean Blue is 2.9 and Forest 2.6, left unasserted. A call for the
  author if they want new accents.
- *Muted* is now named for Sepia (`rgb(205, 190, 168)`), Nord
  (`rgb(190, 198, 212)`) and Ocean Blue (`rgb(174, 183, 204)`; the derived mix
  was 4.43:1 on surface-2). Text, muted reach 4.5:1 on bg, surface and
  surface-2 for every preset.
- *Meaning colours.* Dark themes: `#fca5a5` / `#4ade80` / `#fbbf24` (red-300,
  not red-400: red-400 failed 4.5:1 on Sepia, Nord, Ocean Blue). Paper White:
  `#b91c1c` / `#166534` / `#92400e`. All reach 4.5:1 on bg, surface and as
  text on their own 15% fill over bg, for every preset.
- *onAccent* per preset (contrast with accent): Ink `#121212` 13.8; Ocean Blue
  `#111111` 5.1; Sepia bg 4.6; Pure Dark bg 7.5; Paper White bg 7.3 (`#fafaf8`);
  Forest `#fafafa` 4.7; Sunset bg 5.4; Nord bg 6.2; Solarized `#111111` 5.1.
- *The script* is a hand-copied ES5 version of `themeTokens()` with the preset
  list serialised in, as the design says (a toString of the real functions
  does not survive minification). It does not set the `theme-color` meta:
  adding a <head> child from outside React risks a hydration mismatch, so
  `applyThemeVars` sets it after load. `color-scheme` is also in `:root`
  (dark), so a page with no script is Ink.
- *New exports* in themeTokens.ts beyond the plan: `relativeLuminance`,
  `contrastRatio`, `findThemePreset`, `themeVarEntries`, `MEANING_DARK/LIGHT`;
  and `applySavedTheme()` in FontSettingsTab.tsx, which `initializeFonts` calls
  synchronously before its IndexedDB wait and `FontInitializer` calls on
  `storage` (key `storyTheme`, or null) and on `SYNC_COMPLETED_EVENT`.
- *Select arrow* is two CSS gradients in `--ys-muted` (a data-URI image cannot
  read a custom property); the separate disabled-arrow rule is gone (opacity
  covers it).
- *`ys-modal-backdrop`* is the theme background pushed toward black, 70%
  opaque, with the old blur; `ys-modal` is surface, border, `rounded-2xl`.
- *Ratchet:* the "every .tsx is listed or exempt" case is written and
  `it.skip`. The exempt list holds `palette.ts` and `diceColors.ts` (both
  `.ts`, so the walk would not see them; they are listed for slice 5). The
  picker swatches live in FontSettingsTab.tsx, which is not listed until slice
  2, so no region exemption exists yet; slice 2 records how.
- `FontInitializer.tsx` and `layout.tsx` are on the ratchet list too.

### Slice 2 — 2026-10-23

**Dependency inventory.** The Settings screen is `APIKeysModal` (in
`FullScreenView`, converted in slice 1), which renders `AIConfigTab`,
`ArchitectureSettingsTab`, `ImageSettingsTab`, `CustomVoiceManager`,
`FontSettingsTab` and `SyncTab`; `AIConfigTab` renders `SamplingSettingsTab`,
`ModelSelect` (slice 1), `TurnCostPanel` and `SideAgentPickers` (exported from
`ArchitectureSettingsTab`). `ModelSlotRow` is defined inside `AIConfigTab`, not
a separate file. Not in the plan's list and converted here because the Voice
tab renders it: `CustomVoiceManager.tsx` (it still had `dark:` pairs on
grays). `InfoTabs` and `ClaudeSubscriptionPanel` are rendered from the landing
page and `AIConfigTab` respectively. No data module supplies colours to these
screens (`ratchet` passes with no inline colour).

**Judgment calls.**
- *Picker swatches need no exemption.* They take their colours from
  `THEME_PRESETS` through `style={{ backgroundColor: themeOption.background }}`
  (a property, not a literal), so `FontSettingsTab.tsx` is listed outright.
- *Provider tiles* in the API keys tab (each had its own brand gradient) are
  one `bg-ys-accent` tile with `text-ys-on-accent` initials; the initials
  already name the provider. `InfoTabs`' per-card `gradient` field is gone for
  the same reason.
- *Toggle switches* (eight copies of the same long class string): off track
  `bg-ys-border`, knob `after:bg-ys-bg`, on track `peer-checked:bg-ys-accent`.
  The old knob was white on a translucent-white track, which would vanish on
  Paper White.
- *Gradient primary buttons* became `ys-button ys-button--primary` (sizes kept);
  the emerald "apply" button in Sampling is `ys-button` with `ys-success` fill,
  border and text; selected pills are `bg-ys-accent text-ys-on-accent`.
- *Inputs* (22 of them) are `ys-input`; `p-4` panels are `ys-card`, and panels
  nested in a card use `bg-ys-surface-2`.
- *Context-size and speed sliders in AIConfigTab:* the green-yellow-purple bar
  is `from-ys-success via-ys-warning to-ys-accent` (the speed bar's old
  green-blue-purple now uses the same); the stop dots are `bg-ys-text` when
  selected and `bg-ys-bg` with a muted border otherwise (both were the same
  colour after the first mapping pass).
- *Mechanical pass.* A script mapped the class tokens (blue-100 to text,
  other blue/white-alpha text to muted, purple/violet to accent, red/green/
  amber to the ys meaning tokens); everything it could not (gradients, hover
  pairs that became no-ops, the knobs, nested surfaces, selected states) was
  hand-fixed and read through.
- Tests: no markup test needed changing. The suite grew by the 11 ratchet
  entries.

### Slice 3 — 2026-10-23

**Dependency inventory.** The story's sub-pages render through more than the
plan's list. Converted here, and listed on the ratchet: `DynamicIcon` (clean),
`StoryImage`, `LoreImageGenerator` (the note editor's picture block),
`IconPicker` (the NPC editor; it was slice 5's), `SyncIndicator`,
`NetStatusBadge`, `ChapterNav`, `CombatDisplay`, `DiceThrowModal`,
`ManualRollModal`, `AskQuestionModal`, `PlayerBubbles`, `OOCChatPanel`,
`TurnLobbyOverlay`, `PartyLobby`, `PartyTableStrip`, `TTSControls`,
`SyncConflictModal` and `ProfilePickerModal` (the story page's picker; it was
slice 5's), plus `StoryTurn`, `StoryHeader`, `StoryMenuSheet` and
`NPCReactionToast` in `app/story/` (listed; each held one or two leftovers).
**Not converted, still dark-only inside these screens:** `LibraryPickerModal`
and `PDFImporter` (opened from the note editor; slices 4 and 5) and
`pdf-import/NotePreviewCard` (still has a `prose-invert`; slice 5).
`ClockCategorySelector` is imported nowhere.

**`noteMentions` colours (decided first).** Note types are categories, so the
fourteen hues collapse to three groups on the tokens: what the player knows
(`character_sheet`, `npc`, `item`, `location`, `faction`, `event`, `lore`,
`table`, `all`) is `ys-accent`; the GM's own material (`gm_notes`, `gm_plan`,
`mechanics`, `dm_instructions`, `story_instructions`, `summary_instructions`)
is `ys-muted` on `ys-surface-2`; secrets are `ys-warning`. Each type still has
its own icon and label, which is what told them apart. `lore.tsx`'s
`TYPE_CONFIG`, `noteMentions.ts` and the NPC mention colour (accent) agree;
`tests/noteMentions.test.ts` follows (one new case for the three groups).
`gm_plan` keeps falling through to the lore colour in mentions, as before.

**Judgment calls.**
- *Method.* The same as slice 2: a script mapped the class tokens (neutral
  surfaces and borders to the tokens, brand hues to accent, red/green/amber to
  the meaning tokens, 100/200-shade text to `ys-text`, low-alpha blue text to
  muted, `dark:` pairs dropped), then every file's diff was read and the
  things it cannot know were fixed by hand.
- *Gradients.* A coloured gradient button is `bg-ys-accent` with
  `text-ys-on-accent`; a green or red one is the tinted `/15` fill with a
  `border-ys-*/40` (the glow shadow is gone); a gradient with an alpha keeps
  it. Image scrims (`from-black/..`) become `from-ys-bg/..`. The story page's
  loading and error frames are `bg-ys-bg` (the `--ys-gradient` surfaces are
  home, Library and the Designer, slice 4/5).
- *Toggles* in `menu.tsx` use slice 2's pattern (track `bg-ys-border`, knob
  `after:bg-ys-bg`, on `peer-checked:bg-ys-accent`; the party-link toggle is
  `ys-success`).
- *Shadows.* `shadow-black/..` and the other neutral shadow colours are
  dropped (Tailwind's default shadow is already black); hued glows
  (`rgba(168,85,247,..)` and the like) are `color-mix` on the accent or
  meaning token. A plain black `rgba(0,0,0,.x)` drop shadow in an arbitrary
  `shadow-[..]` or `boxShadow` is left: black is the colour of a shadow on
  every theme, and the ratchet does not read it as a theme colour.
- *Player colours.* The text on a player's colour (`couch` pills, the speaker
  tabs, the roll and question labels, the mic bubbles) is a fixed white,
  `PLAYER_TEXT_COLOR`; with the host and join defaults, the grey fallback and
  the QR code's black and white it now lives in `app/misc/multiplayer/palette.ts`
  (already exempt as the player palette). `page.tsx`, `LoreEditor`,
  `PartyLobby`, `PlayerBubbles`, `story.tsx` and the two roll modals import it.
  The QR code's quiet zone stays white through an inline style. The active
  bubble's ring is `ys-text` through `color-mix`.
- *Context and Log viewers.* Roles: system muted on surface, user text on
  surface, GM accent on a faint accent fill, tool text on `ys-surface-2` with
  an `accent/40` border (a new `getRoleBorderColor`, since two border colours
  cannot share one element). Log types: error danger, warning warning,
  ai_request accent, ai_response success, action text, state_change text at
  70%, the rest muted. The uppercase label names the type either way. The
  panels in the AI Context that had their own hue (cyan, teal, blue, purple,
  indigo) are all accent now, each with its heading and icon; amber, orange
  and rose became warning, warning and danger.
- *NPC status and attitude* (`npcs.tsx`) keep their meaning colours (alive and
  friendly success, hostile danger, missing and unfriendly warning); dead,
  departed and neutral are muted; unknown and allied are accent.
- *`GameIcon.tsx` is exempt*, with the reason in the ratchet's list: it
  rewrites the icon library's SVG `fill="#fff"` and `fill="black"` to
  `currentColor`, so its literals are what it matches, not colours it paints.
- *`ConfirmDialog`'s `confirmButtonClass`* strings in `menu.tsx` are tokens
  too, though the dialog ignores them (slice 1 note).
- *Ratchet.* 43 files added. No test needed a markup change; the suite
  grew by the 43 entries (2,703 to 2,747 passed, one skipped as before) and
  one `noteMentions` case.
- *Scrollbars.* Neither `scrollbar-thumb-*` use survives (`lore.tsx`,
  `npcs.tsx`); nor does any `prose-invert` in these files.

**Not verified here (the preview was not run, by instruction).** Each screen
in Ink and Paper White: Notes, NPCs, Goals, every Story Editor section, AI
Context with a stored turn, the Logs, combat, the dice tray, and the party
lobby's QR code. The places most likely to read wrong in Paper White: the
tinted `/15` action buttons, the accent-tinted panels in the AI Context, and
the image lightbox (its backdrop is the theme's `ys-modal-backdrop`, dark text
on a mid-grey in Paper White).

### Slice 4 — 2026-10-23

**Dependency inventory.** The Library page (`app/library/page.tsx`) renders the
three tabs, `LibraryHome`, `FolderDetailView` and `BuiltinSystemsSection`, and
opens `LibraryPickerModal`, `JoinGameModal`, `HostGameModal`,
`ExportFolderModal` and `NewFolderDialog`; the tabs also open `ConfirmDialog`
(slice 1), `FolderActionSheet` and `NewFolderDialog`, and `NotesLibraryTab`
opens `FullScreenView` (slice 1) and `PDFImporter` (**not converted: slice
5**). The Designer page renders `DesignerChat`, `AdventureInspector`,
`LibraryPickerModal` (converted here, since both screens open it),
`APIKeysModal` (slice 2) and `ClaudeSubscriptionPanel` (slice 2). No data
module supplies colours; the folder colours are player data.
`DynamicIcon`, `DraggableScroll` and `Skeleton` were already clean.
Converted and on the ratchet: 7 files in `app/library/`, 3 in `app/creator/`,
and `LibraryPickerModal`, `NewFolderDialog`, `FolderActionSheet`,
`ExportFolderModal`, `JoinGameModal`, `HostGameModal`. (`LibraryPickerModal`
is also opened from the note editor in the story, so that path is now themed.)

**Judgment calls.**
- *Method.* The same as slices 2 and 3: a script mapped class tokens, then every
  diff was read and the things it cannot know were fixed by hand (text on an
  accent fill, dialog buttons on a modal surface, check marks, dots).
- *Gradient.* The Library page, its loading frame and the Designer page (and
  its loading frames) are `bg-[image:var(--ys-gradient)]`. Gradient cards (the
  recent-story tiles, the rules-pack banner) are plain `bg-ys-surface-2` /
  `bg-ys-warning/15`; gradient buttons are `bg-ys-accent text-ys-on-accent`.
- *Surfaces.* The translucent blue panels (`bg-blue-950/50` and the like) lost
  their alpha and became `bg-ys-surface`; hover is `bg-ys-surface-2`. Inside a
  `ys-modal` (the delete/new-folder/export/host/join dialogs) secondary buttons
  and inputs are `bg-ys-surface-2` (hover `bg-ys-border`), since a surface fill
  on a surface panel would vanish. In the Designer's inspector (a surface
  panel) its cards and inputs are `bg-ys-surface-2` for the same reason.
- *Backdrops.* Every `fixed inset-0 bg-black/..` overlay is `ys-modal-backdrop`;
  the dialog panels are `ys-modal` (the ExportFolderModal's hard-coded `#0d1829`
  went with that).
- *White-alpha text in the Designer* (`text-white/25..60`, about 50 uses)
  is `text-ys-muted`, and 70% and up is `text-ys-text`: alpha on text cannot
  reach 4.5:1 on Paper White.
- *`ConfirmDialog` callers.* The four Library files pass
  `confirmButtonClass: "ys-button--danger"`, a marker the dialog reads as
  "destructive" (it ignores the string, slice 1); the prop's shape is unchanged.
- *Note types in the Inspector* follow slice 3's grouping: lore and the
  character sheet accent; the GM's own notes (mechanics, DM, story and summary
  instructions, plan) muted on surface-2; secrets warning. NPC attitudes:
  hostile danger, unfriendly warning, friendly success, allied accent, neutral
  muted.
- *Folder colours stay data.* The per-folder inline colours (stripes, tinted icon
  tiles, the colour inputs) are untouched. The two fixed fallbacks that were
  hex literals in `.tsx` (`#9333ea` for a new folder, `#64748b` for Unfiled)
  moved to `app/misc/folderColors.ts` (`NEW_FOLDER_COLOR`,
  `UNFILED_FOLDER_COLOR`), outside the ratchet's reach and next to the default
  `localFolderManager` already uses.
- *Ratchet.* 16 files added; no test needed a markup change; the suite grew by
  the 16 entries (2,747 to 2,763 passed, one skipped as before).
- *Scrollbars / prose.* The one `prose-invert` (`DesignerChat`) is gone.

**Not verified here (the preview was not run, by instruction).** Each screen in
Ink and Paper White: Library home, a folder, each tab, selection mode, the
dialogs (new folder, folder actions, export, host, join, delete confirm), the
notes picker, and the Designer with a draft open. Likeliest to read wrong in
Paper White: the `/15` danger and warning tints on `bg-ys-surface`, the
`bg-ys-surface/80` Library header over the gradient, and the Designer's
message bubble (`bg-ys-accent/25` on the gradient).

### Slice 5 — 2026-10-23

**Dependency inventory.** Beyond the plan's list, a grep of every `.tsx` under
`app/` that was neither listed nor exempt found these, all converted and put on
the ratchet: `LastPlayedStories`, `LocalStoryList` and `LocalAdventureList`
(the home page's lists, which still carried `dark:` pairs), `STTButton`,
`LandingAuthSection`, `StaticIcon` (one `bg-gray-400`). Clean already and now
listed: `DynamicIcon`, `InlineScript`, `NativeBackButton`, `app/party/page.tsx`,
`APIKeysContext`, `NotificationContext` (each checked with the detector, not
assumed). `ProfilePickerModal`, `LibraryPickerModal` and `IconPicker` were done
in slices 3 and 4. `ClockCategorySelector` is imported nowhere, converted anyway
so the ratchet can close.

**Converted (slice 5):** `PDFImporter`, `pdf-import/ExtractionPreview`,
`pdf-import/NotePreviewCard` (its `prose-invert` removed), `GuidedStoryStart`,
`ClockCategorySelector`, `MassLoreImageGenerator`, `IconAttribution`,
`SiteHeader`, `app/page.tsx`, `app/terms/page.tsx`, `app/privacy/page.tsx`,
`PartyController`, plus the six extras above.

**Exempt list (the sweep), with reasons** (in the ratchet's `EXEMPT`):
`app/misc/multiplayer/palette.ts` (player colours), `app/misc/diceColors.ts`
(dice materials), `app/components/GameIcon.tsx` (matches the icon library's SVG
fills), `app/dev/dice-spike/page.tsx` (throwaway spike), `app/misc/folderColors.ts`,
`app/misc/folderLibraryExport.ts` and `app/misc/localFolderManager.ts` (the
default `#9333ea` folder colour is stored data, not chrome),
`app/story/themeTokens.ts` and `app/misc/themeBootstrap.ts` (they define the
themes). No other `.tsx` or `.ts` file under `app/` holds a colour.

**Judgment calls.**
- *Method.* The slice 2-4 script again (now with `dark:` pairs resolved to the
  dark value before mapping, hover-aware meaning fills, and pale blue text
  mapped to text/muted instead of accent), then gradients by a second script
  (strong accent stops: `bg-ys-accent text-ys-on-accent hover:opacity-90`; green,
  red and amber: the `/15` tint with a `/40` border and meaning-coloured text;
  dark or faint stops: `bg-ys-surface`, hover `bg-ys-surface-2`; stray
  `shadow-*-950` glows dropped), then every diff read and fixed by hand.
- *Page frame.* Home, Terms and Privacy are `bg-[image:var(--ys-gradient)]`.
  `SiteHeader` takes the gradient too (so it is opaque, not the old 95%
  translucent navy; the blur stays and is now invisible), and its gradient logo
  text is `text-ys-accent`; the home title likewise.
- *`GuidedStoryStart`'s player palette* was a hand-copied list of eight hex
  colours; it now is `PLAYER_PALETTE` from `palette.ts` (same values). Its
  progress-dot rail colour and the ring/border offsets that were `#0d1829` are
  `var(--ys-border)` / `ys-surface`.
- *`ClockCategorySelector`* (inline style colours): the wheel items read
  `var(--ys-*)` and `color-mix`; the glows are two module constants.
- *`PartyController`*: classes on the tokens, the cooldown ring's SVG stroke
  through `stroke-ys-border` / `stroke-ys-warning` classes (not attributes), the
  default join colour from `DEFAULT_JOIN_COLOR`. The player colours (`seat.color`,
  `me.color`, the swatch buttons) stay inline data. Redaction is untouched.
- *The party theme picker* (decision 140) is a collapsed `<details>` labelled
  "Theme" at the foot of the page's `Shell` (so it shows in every state:
  join form, lobby, seated), with the `THEME_PRESETS` swatches (preset background
  and text through `style`, bordered, the selected one ringed). It writes the
  phone's own `localStorage.storyTheme` and calls `applyThemeVars`; its selection is a
  `useSyncExternalStore` over that key so there is no setState-in-effect and no
  hydration mismatch. It imports `themeTokens.ts` (pure, no story bundle). The
  layout's bootstrap script and `FontInitializer` already apply the saved theme
  on load, which is why no extra mount code exists.
- *Ratchet.* The "every .tsx is listed or exempt" case is un-skipped and passes.
  A second case widens the sweep to `.ts`: no `.ts` file under `app/` may hold a
  colour unless exempt (it ran clean after the exemptions above, so the cost was
  zero). The suite is 2,790 passed, 0 skipped (2,764 and one skipped before).
- Lint: unchanged per file against the HEAD copies (`PartyController` 0 -> 0).

**Not verified here (the preview was not run, by instruction).** Each screen in
Ink and Paper White: home, Terms, Privacy, the PDF importer through a preview, the
freeform start wizard, the pickers, the party page at phone width (picker
persisting across a reload). The party picker on a real phone over the LAN origin
needs a device. Likeliest to read wrong in Paper White: the `/15` tints on
`bg-ys-surface` in the PDF importer, the SiteHeader's opaque gradient, and
`GuidedStoryStart`'s accent-tinted panels.
