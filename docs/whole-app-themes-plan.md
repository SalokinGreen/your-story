# The reading themes reach the whole app — implementation plan

Status: **draft, waiting for the author's approval.** Design:
[`whole-app-themes-design.md`](whole-app-themes-design.md). Decisions
137–140. Branch `claude/whole-app-themes`, one PR, six slices. Counts are
from the 2026-10-23 survey on `master` at 69dad7e: grep occurrences of
hard-coded colour classes, red, green and amber included, so they are upper
bounds.

**Every slice ends with `tsc` clean, the suite green, and screenshots in
Ink and in Paper White** of each screen it converted. Screenshots come from
the browser preview, with `localStorage.storyTheme` set to `ink`, then
`paper`, then a reload. After a slice, the ratchet test lists its files.
The baseline is Vitest 179 files / 2,595 tests, `tsc` clean, and lint
counted per touched file.

**The mapping every slice applies** (design §3; judgement wins where the
mapping reads wrong in Paper White):

| today | becomes |
|---|---|
| page backgrounds: `bg-gray-900/950`, `bg-slate-900`, `from-gray-900 via-blue-950 to-purple-950` | `bg-ys-bg`, or `var(--ys-gradient)` on the three gradient surfaces |
| cards and panels: `bg-gray-800`, `bg-white/5`, `bg-black/30` | `ys-card` or `bg-ys-surface` |
| hover, selected, inputs on a card: `bg-gray-700`, `bg-white/10` | `bg-ys-surface-2` |
| borders: `border-gray-700/800`, `border-white/10` | `border-ys-border` |
| body text: `text-white`, `text-gray-100/200` | `text-ys-text` |
| secondary text: `text-gray-400/500` | `text-ys-muted` |
| brand and active: `purple-*`, `blue-*`, `indigo-*`, `violet-*`, `pink-*` | `text-ys-accent`, `bg-ys-accent` with `text-ys-on-accent`, or `ys-button--primary` |
| meaning: `red-*`, `green-*`, `amber-*`/`yellow-*` | `ys-danger` / `ys-success` / `ys-warning` (fills at `/15`) |
| modal overlay: `bg-black/50..80` | `ys-modal-backdrop` |

## Slice 1 — The foundation

- **`app/story/themeTokens.ts`**:
  - `ThemeTokens` gains `surface2`, `onAccent`, `danger`, `success`,
    `warning`, `gradient` and `scheme: "dark" | "light"`.
  - New `isLightTheme(preset)` (relative luminance of the background
    `> 0.5`).
  - `THEME_PRESETS` and `applyThemeVars(preset)` move here from
    `FontSettingsTab.tsx`. `applyThemeVars` also sets the new properties,
    `color-scheme` on `<html>`, and the `theme-color` meta. It keeps
    writing the three old `--story-*` vars for older synced devices.
  - Ink names its own `surface2` (`#262626`), so the story screen does not
    shift.
- **`app/globals.css`**:
  - `:root` holds Ink's values for every token, the new ones included.
  - `@theme inline` adds `--color-ys-surface-2`, `-on-accent`, `-danger`,
    `-success` and `-warning`.
  - `body` reads `var(--ys-bg)` and `var(--ys-text)`; the OS media query
    and `--background` / `--foreground` are deleted (grep that nothing else
    reads them).
  - `.prose a` becomes the accent, underlined.
  - `@layer components` gets `ys-card`, `ys-input`, `ys-button` (and its
    `--primary`, `--ghost` and `--danger` variants), `ys-chip`,
    `ys-modal-backdrop` and `ys-modal`, each on the tokens.
- **`app/layout.tsx`**: an inline `<script>` in `<head>`, from a new
  `app/misc/themeBootstrap.ts` that exports the script as a string. It
  reads `storyTheme`, finds the preset, and sets the tokens and
  `color-scheme` before paint. It falls back to Ink on any error. The
  `themeTokens()` arithmetic is serialised into the script, so the two
  cannot drift (the test below holds them together).
- **`app/components/FontSettingsTab.tsx`** imports the moved pieces. Its
  swatches stay literal.
- **`app/components/NotificationContainer.tsx`**: the `dark:` variants go,
  and the toasts use the meaning tokens.
- **Tests:**
  - `tests/themeTokens.test.ts` checks every preset: text, muted, accent,
    on-accent, danger, success and warning, each against bg and surface. It
    uses the existing contrast helper and its thresholds.
  - `isLightTheme` is true only for Paper White.
  - The bootstrap script's tokens equal `themeTokens()` for every preset.
    The test evaluates the script string against a fake `document`.
  - New `tests/themeTokensOnly.test.ts` holds the ratchet. Its file list
    starts with `globals.css` and `NotificationContainer.tsx`.
- **Check:** the story screen in Ink is unchanged, pixel for pixel by eye
  against a before screenshot. Paper White sets the body background with no
  dark first frame (reload with the network throttled). The toasts work in
  both themes.

## Slice 2 — Settings

- `APIKeysModal.tsx` (122), `AIConfigTab.tsx` (101), `FontSettingsTab.tsx`
  (55, minus its swatches), `TurnCostPanel.tsx` (40), `SamplingSettingsTab.tsx`
  (40), `ArchitectureSettingsTab.tsx` (36), `SyncTab.tsx` (30),
  `ImageSettingsTab.tsx` (21), `ClaudeSubscriptionPanel.tsx` (13),
  `ModelSelect.tsx` and `InfoTabs.tsx` (15).
- **Check:** each tab in Ink and in Paper White. Inputs, the model pickers
  and the cost table must be readable in both.

## Slice 3 — The story's own sub-pages

- `lore.tsx` (Notes, 137), `npcs.tsx` (116), `goals.tsx` (66), `menu.tsx`
  (92), and `menu/*`: `LoreEditor` 83, `NPCEditor` 49, `BasicSettings` 43,
  `OnlinePlayEditor` 31, `GoalEditor` 27, `CompactStoryModal` 27,
  `ThreadsEditor` 23 and the rest under 15.
- Also `MetersPanel.tsx` (22), `ContextViewer.tsx` (173), `LogViewer.tsx`
  (19), and the leftovers in `page.tsx` (38) and `story.tsx`.
- In the context and log viewers, the role and stage colours map to:
  - system → muted;
  - user → text;
  - the GM → accent;
  - tool → `surface-2` with an accent border;
  - errors → danger;
  - warnings → warning.
- **Check:** Notes, NPCs, Goals, the Story Editor's every section, AI
  Context with a real stored turn, and the Logs, each in Ink and in Paper
  White.

## Slice 4 — Library and Designer

- `app/library/*`: `NotesLibraryTab` 65, `StoriesLibraryTab` 36,
  `AdventuresLibraryTab` 27, `LibraryHome` 18, `BuiltinSystemsSection` 13,
  `FolderDetailView` and the rest.
- The Library dialogs: `NewFolderDialog`, `FolderActionSheet`,
  `ExportFolderModal`, `JoinGameModal` (14) and `HostGameModal` (13).
- `app/creator/*`: `AdventureInspector` 57, `page.tsx` 26, `DesignerChat` 18.
- The Library background takes `--ys-gradient` (decision 139).
- **Check:** the Library home, a folder, each tab, the dialogs, and the
  Designer with a draft open, each in Ink and in Paper White.

## Slice 5 — Everything else

- **Importers and starts:** `PDFImporter.tsx` (152), `pdf-import/*`
  (`NotePreviewCard` 31, `ExtractionPreview` 13) and `GuidedStoryStart.tsx`
  (80).
- **Pickers:** `ProfilePickerModal` (33), `LibraryPickerModal` (29),
  `ClockCategorySelector` (28), `IconPicker` (25), `MassLoreImageGenerator`
  (22) and `IconAttribution` (16).
- **Page chrome:** `SiteHeader.tsx` (17, which takes `--ys-gradient`),
  `app/page.tsx` (65, the home page, which takes `--ys-gradient`),
  `app/terms/page.tsx` (35) and `app/privacy/page.tsx` (32).
- **The party phone page:** `app/party/PartyController.tsx` (44). Its
  inline style colours move to the tokens; the player colours stay.
- **The `app/misc` colour data:** `noteMentions.ts` (14). Decide per
  colour: does it mean something, or is it chrome?
- **Then the sweep:** grep `app/` for anything left (`purple-`, `blue-`,
  `gray-`, `bg-white`, `text-white`, `dark:`). Every file still holding one
  is either converted here or recorded as exempt, with the reason, in the
  slice's "Decisions made" entry. The ratchet list then covers every file in
  `app/` except the exempt ones.
- **Check:** the home page, the PDF importer through a preview, the freeform
  start wizard, the pickers, and the party phone page (at `/party` in the
  preview, phone width), each in Ink and in Paper White.

## Slice 6 — Docs

- **`CLAUDE.md` Conventions:**
  - "The story screen's colours are the `ys-*` tokens" becomes "every
    screen's".
  - It lists the new tokens and the component classes.
  - It drops "The Notes, NPC, Goal, Settings and Library pages have not
    moved to the tokens yet."
  - It adds: "a new file joins `tests/themeTokensOnly.test.ts`".
- **`docs/story-screen-design.md`:** a dated note that the tokens now cover
  the whole app.
- **`docs/pending_tests.md`:** the desktop app and the APK in Paper White
  (title bar and status bar colour, native scrollbars, no dark flash on
  launch), and the party phone page on a real phone.
- **The devlog,** with the before and after pairs per area in Ink and in
  Paper White.
- **The two docs** are marked built.

## What breaks, and for whom

- **Nobody's data or settings:** same key, same presets, Ink default.
- **Players on a dark OS who never picked a theme** saw Ink on the story
  screen and the OS-dark grey elsewhere. They now see Ink everywhere.
- **Players on Ocean Blue (`default`)** now see it everywhere, which is what
  decision 137 asks for.

## Decisions made during implementation

(Filled in as slices land.)
