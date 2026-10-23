# The reading themes reach the whole app — design

Status: **draft, waiting for the author's approval.** The implementation plan
is [`whole-app-themes-plan.md`](whole-app-themes-plan.md). Decisions 137–140
in [`decisions.md`](decisions.md).

## 1. Why

The author: "I want to work on making the themes reach all of the platform
with ink being the default."

The story screen moved to six colour tokens (`--ys-bg`, `surface`, `text`,
`muted`, `border`, `accent`; decisions 112–117) set by the reading theme, with
Ink the default. Nothing else did. A survey on 2026-10-23 found:

- **The pipes already reach every route, and nothing uses them.**
  `applyThemeVars()` sets the tokens on `<html>` from the root layout,
  `globals.css` holds Ink as the fallback, and Tailwind has `bg-ys-*`,
  `text-ys-*` and `border-ys-*` everywhere. The Library, the Designer, the
  party phone page, the home page, and the terms and privacy pages still use
  the tokens zero times.
- **The page background ignores the theme.** `body` uses `--background`,
  which flips between white and near-black with the OS light/dark setting.
  `dark:` variants (the toasts) follow the OS too. No `color-scheme` is set,
  so scrollbars and form controls follow the OS.
- **Size.** About 3,100 hard-coded colour classes sit outside the story
  screen, and about 2,000 more in its own sub-pages:
  - Notes 137, NPCs 116, the Story Editor and `menu/` about 300, the AI
    Context view 173, the Logs 19.
  - The biggest single files: the PDF importer (152), the Settings modal
    `APIKeysModal` (122), the AI settings tab (101), the freeform start
    `GuidedStoryStart` (80), the Library's notes tab (65).
- **No shared primitives.** There is no shared button, card, input or modal.
  Every file styles itself. `ConfirmDialog` is already fully on the tokens
  and is the template.
- **Fixed on purpose:**
  - couch co-op player colours (`multiplayer/palette.ts`);
  - the 3D dice (`diceColors.ts`, drawn on a canvas);
  - the theme picker's own swatches;
  - red, green and amber where they mean danger, success and warning.

## 2. What the player sees afterwards

- **One look everywhere** (decision 137). Picking a theme in Settings →
  Reading changes every screen:
  - the Library, the Designer, Settings and all its tabs;
  - Notes, NPCs, Goals, the Story Editor, AI Context and the Logs;
  - the PDF importer, the pickers and dialogs, the toasts;
  - the home page, the site header, terms and privacy;
  - the party phone page, which follows that phone's own theme (decision
    140);
  - the page background itself.
- **Ink stays the default.** A player who never picked a theme sees Ink on
  every screen: the near-black page and the warm off-white accent. Story
  prose stays in Georgia, and the sans-serif UI font is unchanged.
- **Paper White works everywhere** (decision 138). That means a light page,
  dark text, readable inputs, badges, code blocks and dialogs, and light
  scrollbars and form controls (`color-scheme: light`).
- **A subtle gradient where there was a loud one** (decision 139). The home
  page, the Library background and the site header lose the fixed
  blue-to-purple. They get a gentle gradient from the theme's own
  background toward a few percent of its accent, so it changes with the
  theme. The story screen stays flat.
- **Colours that carry meaning stay recognisable in every theme.** Danger,
  success and warning become theme-aware tokens (red, green and amber, at a
  lightness that reads on that theme's background). Player colours and dice
  keep their fixed palettes.
- **No flash of the wrong theme on load.** A player on Paper White does not
  see a dark frame first.

## 3. How

### 3.1 The tokens

The six stay. Five more are derived the way the existing ones already are
(`themeTokens()`: a preset may name its own, otherwise they are mixed):

| token | what for | derived as |
|---|---|---|
| `--ys-surface-2` | a raised or hovered surface: menus, selected rows, inputs on a card | bg mixed 11% toward text |
| `--ys-on-accent` | text and icons on an accent fill (primary buttons) | bg or text, whichever contrasts more with accent |
| `--ys-danger` / `--ys-success` / `--ys-warning` | meaning colours for text, borders and icons; fills use them at low opacity | fixed hues (red, green, amber) at a lightness chosen by whether the theme is light or dark |

Two more tokens are not colours:
- `--ys-gradient`, the background gradient (§3.4).
- the scheme, `dark` or `light`, applied as `color-scheme` on `<html>`.

A theme is light when its background's relative luminance is over 0.5. Only
Paper White is light today.

`THEME_PRESETS` and `applyThemeVars` move from `FontSettingsTab.tsx` into
`themeTokens.ts`, so the list, the arithmetic and the applying live
together. The picker imports them. `tests/themeTokens.test.ts` already
checks text, muted and accent against bg for contrast. It grows to check
every preset's on-accent, danger, success and warning, against both bg and
surface.

### 3.2 The page itself

- `body` takes `background: var(--ys-bg)` and `color: var(--ys-text)`. The
  OS media query and `--background` / `--foreground` go.
- `<html>` gets `color-scheme` from the theme. A `theme-color` meta follows
  `--ys-bg`, so the phone's status bar matches.
- `.prose a` is violet today. It becomes the accent, underlined.
- `dark:` variants are removed where they exist (the toasts): the theme
  decides, not the OS.
- **No flash.** A small inline script in the root layout's `<head>` reads
  `storyTheme` and sets the tokens before first paint. It is a copy of the
  same arithmetic as `themeTokens()`, kept in step by a test that runs both
  on every preset. `FontInitializer` still runs afterwards, as today. The
  static export and the desktop app (`csp: null`) allow an inline script.

### 3.3 A few shared classes, not a component library

Converting about 5,000 class strings one by one would scatter the same
handful of patterns across 80 files. So a few component classes live in
`globals.css` (`@layer components`), each written once on the tokens:

- `ys-card`: a surface with a border and rounding.
- `ys-input`: field, focus and placeholder.
- `ys-button`, with `ys-button--primary` (accent fill, on-accent text),
  `--ghost` and `--danger`.
- `ys-chip`: small badges.
- `ys-modal-backdrop` and `ys-modal`.

Files adopt them where they replace a repeated pattern. Elsewhere, plain
`bg-ys-*` / `text-ys-*` utilities do the job. No new React components and
no props: nothing to learn beyond the names.

### 3.4 The gradient

`--ys-gradient` is `linear-gradient(160deg, bg, mix(bg, accent, 7%))`,
computed in `themeTokens()`. It is used by the home page, the Library
background and the site header, and nowhere else.

### 3.5 Holding the line

A test (`tests/themeTokensOnly.test.ts`) reads every converted file and
fails on a hard-coded colour class:
- palette colours: `purple-`, `blue-`, `indigo-`, `violet-`, `pink-`,
  `gray-`, `slate-`, `zinc-`, `neutral-`, `stone-`;
- black and white: `bg-white`, `text-white`, `bg-black`, `text-black`;
- `from-` / `via-` / `to-` colour stops;
- a hex or `rgb(` inside a `className`;
- `dark:`.

It works from an explicit list of the files each slice converts. The list
only grows, so a later change cannot quietly bring back `bg-gray-800`. Red,
green and amber are allowed only as `ys-danger`, `ys-success` and
`ys-warning`.

Some files are exempt because they hold fixed palettes: `palette.ts`,
`diceColors.ts`, the picker's swatches, and `noteMentions.ts` (to be checked
when its slice comes).

## 4. What stays the same, and what is out of scope

- One `storyTheme` key, synced, with Ink as the default. Party phones keep
  their own (decision 140); the phone page already runs the same
  initialiser.
- The reading font settings still apply to story prose only.
- The dice tray's 3D dice and the couch co-op player colours do not change.
- Out of scope: new themes, a theme editor, a "follow the OS" option, and the
  README.

## 5. Risks

- **Paper White on every screen is the real work.** Some screens assume a
  dark page: white text on a translucent black overlay, `bg-white/10`
  hovers. Each slice is screenshotted in Ink and in Paper White, and the
  light-theme misses show up there.
- **The AI Context and Logs views colour roles and stages** (system, user,
  tool, error). These become accent, muted and the meaning tokens, and the
  distinctions must survive. That is checked in the screenshot pass.
- **The size.** About 5,000 strings across about 80 files. Slices go by
  area, and the ratchet test keeps converted files converted. This is a
  styling change with no behaviour to retest, so the test count rises only
  by the ratchet and the token tests.
