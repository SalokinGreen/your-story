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
