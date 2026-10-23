# The story screen, simplified — implementation plan

2026-10-23. Status: **approved (decision 117), being built on `claude/story-screen`.** It builds
[`story-screen-design.md`](story-screen-design.md) (decisions 112–116) and adds
no product decisions of its own. The few calls it had to make are in §9.

## 0. Shape

- **One branch, `claude/story-screen`, one PR, seven slices**, each a commit.
  The slices can't be split into separate PRs that each ship: removing the tab
  bar (slice 2) strands Notes, NPCs and Goals unless the story menu lands in
  the same change.
- **No engine change.** Nothing in `app/misc/` changes, and nothing the GM
  loop runs. The new pure helpers go in `app/story/`, not `app/misc/`, so
  there's no doubt that the `engine-review` agent isn't needed. `StoryData`
  and `structs.ts` are untouched.
- **No new setting.** The only new stored values are the three extra colour
  tokens each theme carries.
- Built by an `implementer` (Sonnet) from this file, one slice at a time. The
  baseline (suite count, `tsc`, lint counts of the touched files) is taken
  **before** the first edit, by the planning session, not the implementer.

## 1. What the code does today (the facts the slices rely on)

| piece | where | note |
|---|---|---|
| tab row: ← Library, `StoryTabBar`, ⚙ | `app/story/page.tsx:5401–5440` | `currentState` is the `StoryState` enum (`page.tsx:433`); Notes, NPCs, Goals, Menu, Logs and Context are each a whole page swapped in at `page.tsx:5449–5670` |
| page backdrop | `page.tsx:5390–5398` | blue-purple gradient plus three blurred orbs |
| title strip | `story.tsx:1328–1385` | `SyncIndicator`, `NetStatusBadge`, story name, scroll hint, `ChapterNav`, `ObjectivesStrip`, `CombatDisplay` |
| a turn | `ChatMessage`, `story.tsx:357–527` | avatar row, tier badge, a purple card; `TimelineView` puts thinking and tool pills in among the prose paragraphs; pictures come after the prose |
| dimming | `story.tsx:1166–1170`, `isPrevious` | the last three exchanges render separately and the older two of them are dimmed to 50% |
| action bar | `story.tsx:1596–1686` | Undo (or "Undo revision"), Retry, Edit, Illustrate, and `TTSControls`, which stays mounted and **runs auto-narrate** |
| edit panel | `story.tsx:1543–1593` | always edits `parts.length - 1` |
| `handleEdit` | `page.tsx:4736` | `(editedText, partIndex)`. It already works for any index: it refuses player parts, writes `raw`, clears `observerRewriteOriginal`, and updates `storyText` only for the last part. History replays `raw ‖ content`, so the GM sees an edit. An edit pushes no undo snapshot. |
| composer | `StoryComposer`, `story.tsx:543–780` | chips, couch switcher, textarea, purple ↑ send, red ■ stop |
| voice | `PlayerBubbles` (`app/components/PlayerBubbles.tsx`) at `story.tsx:1735` | solo play gets `SOLO_VOICE_PLAYER`; recording, waveform, 3 s silence stop and `sttFetch` all live inside it; `sttEnabled` gates it |
| themes | `THEME_PRESETS`, `app/components/FontSettingsTab.tsx:134–191` | eight `{id, name, background, text, accent}`; `applyFontSettings` (250–311) and `initializeFonts` (799–854, mounted by `FontInitializer` in `app/layout.tsx`) set `--story-bg-color`, `--story-text-color` and `--story-accent-color` on `<html>`. Nothing reads them through `var()`: `story.tsx:917–966` copies them into React state via `getComputedStyle`. |
| OOC chat | `OOCChatPanel.tsx:45–62` | edge tab when closed; `showOOCChat` and the unread sum live in `page.tsx:1224–1228, 5683` |
| menu | `MenuPage`, `app/story/menu.tsx:526–945` | every action and its modals; `StoryState.MENU` is also set at `page.tsx:1557` and `1732` (the auto-opened Online section) |
| tests | `vitest.config.ts` | environment `node`, no DOM library; `tests/systems.builtins.test.tsx` shows the pattern for markup tests (`renderToStaticMarkup`) |

## 2. Slice 1 — colour tokens and the Ink theme

**New `app/story/themeTokens.ts`** (pure):

```ts
export interface ThemeTokens { bg: string; surface: string; text: string; muted: string; border: string; accent: string }
export interface ThemePreset { id: string; name: string; background: string; text: string; accent: string; surface?: string; muted?: string; border?: string }
/** The six tokens for a preset: its own surface/muted/border when it names them, else mixed from bg and text. */
export function themeTokens(preset: ThemePreset): ThemeTokens
export function mixRgb(a: string, b: string, t: number): string   // accepts #rrggbb and rgb(); returns rgb()
export const INK: ThemePreset   // #121212 / #1c1c1c / #ececec / #9a9a9a / border #2a2a2a / accent #e8dcc4
export const DEFAULT_THEME_ID = "ink"
export const DEFAULT_READING_FONT = "Georgia, 'Noto Serif', serif"
```

The mix: surface = bg mixed 6% toward text, muted = text mixed 38% toward bg,
border = bg mixed 14% toward text.

- **`app/globals.css`**: `:root` gets the Ink values as `--ys-bg`,
  `--ys-surface`, `--ys-text`, `--ys-muted`, `--ys-border` and `--ys-accent`.
  `@theme inline` maps them to Tailwind colours (`--color-ys-bg:
  var(--ys-bg)` and so on), so the chrome is written `bg-ys-bg`,
  `text-ys-muted`, `border-ys-border`. A first paint before
  `initializeFonts` runs is therefore Ink, not white.
- **`FontSettingsTab.tsx`**:
  - `THEME_PRESETS` gets Ink as its first entry and is typed `ThemePreset`.
    The eight existing presets keep their colours and get derived tokens.
  - `applyFontSettings` and `initializeFonts` set all six `--ys-*` vars from
    `themeTokens()`. They keep the three `--story-*` vars for one release,
    because a synced older device may still read them.
  - With no saved `storyTheme`, the theme is `DEFAULT_THEME_ID`. With no
    saved `storyFontFamily`, the font is `DEFAULT_READING_FONT`.
  - A saved value of either is kept (decision 116, §8.3). Whether
    `initializeFonts` writes defaults into localStorage on first run must be
    checked: if it does, it has to stop writing them, or every player would
    count as having "saved" Ocean Blue.
  - The font list gets one more entry, "Book serif (default)", with that
    stack.
- **`story.tsx`**:
  - The `fontSettings` state drops `themeColors` and the `getComputedStyle`
    read (917–966).
  - Background and text come from `bg-ys-bg text-ys-text`.
  - `fontSettings` keeps only the font family, size, line height and
    paragraph spacing.
  - The `FontSettings` interface loses `themeColors`, and every reader is
    updated.
  - `story.tsx` has its own sans-serif fallback, in the initial state and in
    the storage read (917–950). Both become `DEFAULT_READING_FONT`. Changing
    `FontSettingsTab` alone would leave the story in sans-serif, because the
    prose gets its font inline from this state, not from a CSS variable.

Tests, **new `tests/themeTokens.test.ts`**:
- Ink's tokens are exactly the design's values.
- `mixRgb` handles hex and `rgb()` input.
- For every preset in `THEME_PRESETS`:
  - text on bg has a contrast of at least 7:1;
  - muted on bg is at least 4.5:1;
  - accent on bg is at least 3:1.

A preset that fails gets its own `muted` value in the table, not a weaker
test.

## 3. Slice 2 — the header and the story menu

**New `app/story/StoryHeader.tsx`**:

```ts
interface StoryHeaderProps {
  title: string;              // the story name, or the page name off the story
  onBack: () => void;         // ‹ : to the Library on the story, back to the story elsewhere
  onOpenMenu: () => void;
  attention: boolean;         // the dot on ☰
}
```

A 52 px row: `bg-ys-bg border-b border-ys-border`, the title in the reading
font, and ☰ as `DynamicIcon name="Menu"` with a 6 px `bg-ys-accent` dot.

**`page.tsx`**:
- The tab row (5401–5440) becomes `<StoryHeader>`. `attention` is
  `syncStatus === "conflict" || !!netSession || oocUnread > 0`.
- The `oocUnread` sum moves up from 5683 into a `useMemo`.
- The gradient and orbs (5390–5398) render only when `currentState !==
  STORY`. The story itself sits on `bg-ys-bg`. This keeps the Notes, NPC and
  Goal pages on the backdrop they were designed for (§8.5).
- **The menu stops being a page:**
  - Add `const [menuOpen, setMenuOpen] = useState(false)`.
  - `currentState === MENU` is no longer a page, and the two
    `setCurrentState(StoryState.MENU)` calls (1557, 1732) become
    `setMenuOpen(true)`.
  - `StoryState.MENU` stays in the enum, unused, so nothing else breaks.
  - `<MenuPage>` renders inside `<StoryMenuSheet open onClose>` whatever
    page is showing, so the story stays mounted underneath and keeps
    auto-narrating.
- `contentAreaHeight` (the keyboard-aware height measurement) must be
  rechecked: the header changes from about 44 px to 52 px, and the title
  strip and objectives strip go.

**New `app/story/StoryMenuSheet.tsx`**:
- On a phone (`< sm`) it's a bottom sheet: `fixed inset-x-0 bottom-0
  max-h-[85dvh]`, rounded top, a drag-handle bar, a backdrop that closes it,
  and Escape to close.
- From `sm` up it's a right panel, `w-[380px]`, full height.
- Its colours come from `bg-ys-surface text-ys-text`.
- It renders its `children` in its own scrolling body (`overflow-y-auto
  overscroll-contain`, bottom padding `env(safe-area-inset-bottom)`). The story
  page locks document scrolling (`page.tsx:551`), so a long menu, Chapters
  open, or a phone held sideways must scroll inside the sheet.
- **It owns focus while open.** It moves focus to its first row, keeps Tab
  inside itself, and returns focus to ☰ when it closes. `Story` takes a new
  prop `shortcutsSuspended` (true while the sheet, the OOC panel or any play
  modal is open). Today's window key listener (`story.tsx:993`) ignores only
  typing in inputs, so without this Enter or Space would pull focus to the
  composer, and Ctrl+Z or Ctrl+R would undo or regenerate behind the sheet.
- **Stacking:** the sheet and its backdrop sit at `z-50`, above the OOC panel
  (`z-40`) and below the play modals and toasts.

**`menu.tsx` (`MenuPage`)** keeps every handler and modal it has. Only the
body (526–945) is rearranged into the design's §4 order. New props:

```ts
onNavigate: (state: StoryState) => void;      // Notes / NPCs / Goals rows; also closes the sheet
syncStatus?: SyncStatus;
oocUnread: number;
viewingPartIndex: number | null;
onJumpToPart: (index: number) => void;        // the Chapters row
onClose: () => void;
```

1. **Status:** `SyncIndicator` (moved from `story.tsx`), `NetStatusBadge`
   (moved), and the OOC chat button with its unread count.
2. **Notes, NPCs, Goals and Chapters**, each a row with its count.
   - The Goals row shows the active count that `ObjectivesStrip` showed.
   - Chapters expands in place into a chapter list. `ChapterNav`
     (`app/components/ChapterNav.tsx`) owns its own toggle and draws an
     absolutely placed dropdown (19, 58), so the list inside it is extracted
     as `ChapterList({ parts, currentIndex, onJump })`. `ChapterNav` keeps
     using it, and the menu row renders it inline. The row owns the
     open/closed state, and picking a chapter calls `onJumpToPart` and then
     `onClose`.
3. **Story:** Story Editor, Save, Save Copy, Export, Compact Story.
4. **Settings.**
5. **For the curious:** AI Context, Debug Logs. These call `onNavigate`
   with `CONTEXT` and `LOGS`.
6. **Danger:** Restart, Delete.
- The header and quick stats (526–565) go.
- **Player Notes** (682–736) moves into the Story Editor's Basic tab,
  with the same `editingNotes`/`handleSaveNotes` logic.
- **Chat Display Settings** (738–835) is deleted. The Basic tab already
  holds `displayName` and `displayAvatar` (`menu.tsx:205–206, 420–421`). If
  the avatar has no field there, add one.
- Explorer (`handleReturnToExplorer`) goes into section 3.
- **The body's classes move to tokens too, not just the order.** The menu's
  rows set white and pale-blue text on see-through fills (`menu.tsx:605` and
  on). On a light theme's `bg-ys-surface` those would be unreadable. So every
  row, label and button in the sheet takes `ys-*` classes. The Story Editor
  and the other modals the menu opens keep their own look, as they are full
  screen and outside the sheet. This needs a Paper White screenshot.
- **Opening OOC chat from the Status row** calls `onClose()` first and then
  `onOpenOOCChat()`. Today's callback only sets `showOOCChat`
  (`page.tsx:5641`), which would leave the sheet over the chat.

**Off the story.** When `currentState` is LORE, NPCS, GOALS, LOGS or CONTEXT,
the header's ‹ returns to STORY and its title is the page's name. That is
the "‹ back to the story" the design asks for.

**Removed:**
- `StoryTabBar.tsx` (no other importer; confirm with grep).
- From `story.tsx`: the title strip's sync, net badge, name, scroll hint,
  chapter nav and objectives (1336–1376).
- `ObjectivesStrip`, if nothing else imports it.
- The props `syncStatus`, `onOpenJournal` and `onNavigateToIndex` on
  `Story`. Each must be checked for other readers before it goes.

**`OOCChatPanel.tsx`:** the closed state renders nothing; the edge tab
(45–62) goes. The panel opens from the menu's Status row, as it already does
from `menu.tsx:671`.

**Kept:** `CombatDisplay` renders under the header as a slim strip, restyled
to tokens in slice 6.

## 4. Slice 3 — the story page

**New `app/story/turnWork.ts`** (pure):

```ts
/** One quiet line per turn: rolls spelled out, everything else counted. Hidden blocks are skipped entirely. */
export function summarizeTurnWork(blocks: TimelineBlock[]): {
  rolls: string[];                       // headlines, in order
  counts: Array<{ label: string; n: number }>;   // e.g. {label: "notes read", n: 3}
  live?: string;                         // the streaming block's label, e.g. "Thinking…"
  isEmpty: boolean;
}
/** A roll's short form from its contextForStory, or null when the tool is not a roll. */
export function rollHeadline(toolName: string, contextForStory: string): string | null
```

`rollHeadline` cases:

| tool | its text | headline |
|---|---|---|
| `action_roll` | `[Action roll - Ana: Face Danger +Iron: d6 4 + Iron 2 = 6 vs 3 and 8 → WEAK HIT]` | `Face Danger +Iron 6 vs 3, 8 — weak hit` |
| `formula_roll`, one pool | `[Name: …]`, the first line | trimmed of brackets: `1d20+3 = 17` with its label |
| `formula_roll`, several pools | `[Name - N separate pools, NOT added together:]` then one `[  …]` line per pool (`gmExecutor.ts:2533`) | the pool lines, joined with ` · ` so each total stays separate: `1d6+2 = 5 · 2d10: 3, 8` |
| `opposed_formula` | `[Name: reason]`, `[Player: … = N]`, `[Opponent: … = M]` (`gmExecutor.ts:2900`) | `You 14 vs Guard 11` |
| `npc_roll` | the first line | trimmed of brackets |
| `fate_question` | its `[Roll: …→ answer]` line | `Oracle: Yes` |
| `gm_roll` | — | never shown (the block is `hidden`) |
| an unrecognised shape | — | the first bracketed line, cut to 80 characters |

- The headline cannot be wrong in a way that matters, because the expanded
  pills underneath still show the full text.
- The tests use fixtures copied from what each executor actually writes
  (`gmExecutor.ts`), not hand-made strings, so a change to an executor's
  wording fails the test rather than leaving a stale headline.
- `counts` groups the other tools by `getToolProgressLabel` (from
  `gmToolLabels.ts`, which already exists) and counts thinking blocks as
  "thought".
- When a turn has more than one roll, only the first two headlines show,
  followed by "+N more".

**New `app/story/playerLine.ts`** (pure):

```ts
/** Splits a player part into its speakers' lines, each marked in or out of character. */
export function parsePlayerLine(text: string, couchPlayers: CouchPlayer[]):
  Array<{ speaker?: CouchPlayer; name?: string; body: string; ooc: boolean }>
/** The composer's OOC wrap: "(text)", left alone when already bracketed. */
export function wrapOutOfCharacter(text: string): string
```

- `parsePlayerLine` reads the `> Name: text` format that couch co-op and
  `turnText.ts` write. **One part can hold several speakers**: a queued couch
  turn or a party Go joins one `> Name: line` per queued line with newlines
  (`app/misc/party/turnText.ts:20`).
  - Each `> Name:` line starts a new segment.
  - A line without that prefix belongs to the segment before it, so a
    multi-line body stays whole.
  - An unknown name keeps its `name` with no `speaker`, and shows in the
    muted colour.
  - A part with no prefix at all is one segment with no name, which is solo
    play.
- `ooc` is per segment, and is true when that segment's body is wholly
  wrapped in `( … )`.
- `PlayerLine` renders one row per segment.

**New `app/story/StoryTurn.tsx`.** This moves the rendering pieces out of a
1,983-line file. `TimelineEntryPill`, `TimelineView` and `prettify` move with
it and stay exported.
- **`PlayerLine`**:
  - The body is in `text-ys-muted` with a 2 px left rule.
  - The UI font, at 0.9× the reading size.
  - Couch co-op: the speaker's name, in their colour, then the body.
  - OOC: italic, with a small "to the GM" tag.
  - A `comment`-type message (`playerComment`) renders the same, with the
    tag "comment".
- **`TurnWorkLine`**:
  - The `summarizeTurnWork` line in `text-xs text-ys-muted`, with the tier
    badge (and its tooltip) at its end.
  - Tapping it expands the existing pills in their original order.
  - While a turn streams, the line shows the `live` label with a pulse and
    stays collapsed. Today a streaming thinking block auto-expands; that
    stops.
- **`GMTurn`**:
  - Pictures first, full bleed (`-mx-4`, no frame).
  - Then the `TurnWorkLine`.
  - Then the narration. Pills no longer sit between paragraphs.
  - **The narration has exactly one source per turn, and must appear exactly
    once.** Keep today's rule (`ChatMessage`, `story.tsx:400–417`):
    - A turn that is streaming renders the live blocks' text.
    - A saved turn whose GM stage narrated (`narrationCameFromGMStage`,
      `turnTimeline.ts:361`) renders the text blocks rebuilt from
      `gmConversation`.
    - Every other saved turn renders `ScenePart.content` through `prettify`:
      the separate story stage, an edited turn, or an old save with no
      `gmConversation` (`showSeparateContent`).
    - The text blocks are dropped in that last case, so nothing shows twice.
  - An edited turn falls into the last case because `handleEdit` writes
    `raw`/`content` and leaves `gmConversation` alone. The check is whether
    `narrationCameFromGMStage` still matches after an edit. If it doesn't,
    the edit would not show at all. The implementer must test that case in
    the preview.
  - The prose is in `fontSettings` at `text-ys-text`, with no card, avatar
    or name.

**`story.tsx`**:
- `ChatMessage` is replaced by `PlayerLine` and `GMTurn`.
- The previous/visible split (1166–1170) goes, and every exchange renders
  the same way. The typewriter `animate` flag stays true only for the latest
  exchange, as `!isPrevious` does today.
- The feed is `px-4 space-y-6`, with a centred `max-w-[68ch]` column from
  `sm` up (decision 114).
- The streaming turn and the pending player line use the same two
  components.

**`StoryImage.tsx`**:
- The figcaption (cost, model, Regenerate) moves into the full-screen
  dialog, at its bottom edge.
- The inline picture has no frame and no `max-h-96` letterbox. It is
  `w-full h-auto`.
- The failed, missing and "on the host's screen" cards keep their Retry
  inline (design §6).
- Every one of its states takes the tokens: painting, ready, failed,
  declined, missing and guest. Today they set pale text (`StoryImage.tsx:266`
  and on), which a light theme can't read.

**Hidden text and the Observer caveat:** the behaviour is unchanged, and the
classes are swapped to tokens.

Tests:
- **New `tests/turnWork.test.ts`:**
  - each `rollHeadline` row above;
  - a hidden `gm_roll` block contributes nothing, neither a roll nor a count;
  - counts are grouped;
  - "+N more";
  - `live` is set only while a block streams.
- **New `tests/playerLine.test.ts`:**
  - couch prefix with a known name and with an unknown name;
  - a queued turn of three lines from two speakers gives three segments,
    and a multi-line body stays one segment;
  - OOC detection, including `(a) and (b)`, which is not OOC;
  - `wrapOutOfCharacter` is idempotent.
- **New `tests/storyTurn.markup.test.tsx`** (`renderToStaticMarkup`):
  - a turn with a hidden roll leaves no trace of it in the markup;
  - a GM turn has no "Game Master" label.

## 5. Slice 4 — turn actions on tap

**`story.tsx` state:**
- `const [actionsFor, setActionsFor] = useState<number | null>(null)`,
  holding the part index whose row is open.
- `editMode` becomes `editingPart: number | null`.

**`GMTurn` gets `onTap`**:
- It toggles `actionsFor`.
- It ignores taps that land on a button, a link, a mention, a picture or the
  work line, and taps that end a text selection
  (`window.getSelection()?.toString()`).
- The feed's scroll listener (1238–1250) and a tap outside the row clear it.
- A new turn starting clears it too.
- **Keyboard and screen readers.** A tap target alone would lose Edit,
  Illustrate and Read aloud for anyone not using touch, since today they are
  ordinary buttons (`story.tsx:1630`). So each GM turn also has a small
  focusable "Turn actions" button (`aria-expanded`, a `MoreHorizontal`
  icon), placed at the end of its work line. It's dim until hovered or
  focused, and Enter or Space opens the same row. The story's Enter/Space
  shortcut (jump to the composer) must skip it: the listener returns early
  when `e.target` is a button.

**New `TurnActions` in `StoryTurn.tsx`.** It is a row of 40 px icon buttons
with `aria-label`s and titles, each shown on the same condition the action
bar uses today.

| latest GM turn | earlier GM turn |
|---|---|
| Retry (`canRetry`), Undo / Undo revision (`canUndo`), Edit, Illustrate (`canIllustrateLast`), Read aloud | Edit |

**Edit on any turn:**
- The edit panel opens for `editingPart`, filled with that part's `raw ‖
  content`.
- It saves with `onEdit(text, editingPart)`. `handleEdit` needs no change.
- When `editingPart < storyData.scene.summarizedThroughIndex`, the panel
  says "This turn is already in the summary. The GM reads the summary, not
  this text."
- Undo or Retry of a later turn restores that turn's snapshot, which drops
  edits made since. That is already true of edits to the last turn today;
  the plan does not change it.

**Read aloud and the slim player:**
- `TTSControls` must stay mounted, because it runs auto-narrate. It moves
  from the action bar to just above the composer.
- Add `variant?: "bar" | "slim"`. Slim renders nothing while idle, and the
  play/pause and seek row whenever there is unfinished narration: loading,
  playing, **paused**, or muted while audio is still being made. Today
  `isMuted` and `hasAudio` keep the controls up through a pause
  (`TTSControls.tsx:997, 1295`); slim mode uses the same test. It hides when
  playback reaches the end or resets, never on a pause, or a paused reading
  could not be resumed.
- Add `controlHandleRef?: Ref<{ play(): void }>`, next to `relayHandleRef`
  (`TTSControls.tsx:1240`). It calls whatever the idle "Read aloud" button
  calls today (`TTSControls.tsx:1332`).
- The Read aloud action calls `controlHandleRef.current?.play()`.
- The previous and next sentence buttons stay in slim mode from `sm` up and
  are hidden on the phone.

**Removed:** the action bar (1596–1686). The Ctrl+Z, Ctrl+R and arrow-key
shortcuts stay as they are.

## 6. Slice 5 — the composer

Everything below is in `StoryComposer`.

- **OOC toggle:** `const [ooc, setOoc] = useState(false)`.
  - The `( )` button has `aria-pressed`.
  - When it's on, the bar is outlined `ring-1 ring-ys-accent` and the
    placeholder is "Talk to the GM, out of character…".
  - On submit the text goes through `wrapOutOfCharacter` before the existing
    path. Couch co-op gives `> Name: (text)`. Then the toggle switches off.
  - It is never applied to a chip.
- **Mic, solo only:**
  - It shows when `couchPlayers.length === 0 && !partyTable &&
    sttEnabled` (the same key and default as `PlayerBubbles`).
  - It's a `🎙` button, `DynamicIcon name="Mic"`. While recording, the
    recording bar (cancel, waveform, confirm) takes the input's place.
    `RecordingOverlay`'s root is fixed to the viewport (`PlayerBubbles.tsx:155`),
    so it gets a `placement: "floating" | "inline"` prop. Floating is today's,
    for the bubbles. Inline drops `fixed`/`bottom-6`/the translate and fills
    the composer's row, so it stays in the keyboard-aware layout.
  - **The transcript goes into the input; it is not sent.** Today the solo
    bubble queues a line and a separate Generate tap sends it, and a queued
    line can be removed (`PlayerBubbles.tsx:355, 632`). Sending on
    transcription would take that review away and let a 3 s silence send a
    turn. Instead, the text is added to the composer's draft, after a space
    when there is text already. The player reads it, edits it, and taps ▶.
  - A draft that holds transcribed text submits with `inputKind: "voice"`,
    as the bubble's turns do today; one typed from scratch stays
    `"freeform"`.
- **Extract `useVoiceRecorder()`** from `PlayerBubbles.tsx`: start, cancel,
  confirm, the waveform levels, the 3 s silence stop, `sttFetch` with the
  Mistral key, and the error toast.
  - `PlayerBubbles` and the composer mic both use it.
  - `RecordingOverlay` is exported.
  - `PlayerBubbles`' behaviour for couch, online and floor control must stay
    byte-identical; the extraction is a move, not a rewrite.
- **`story.tsx:1735`:** `PlayerBubbles` renders only when
  `couchPlayers.length > 0`. `SOLO_VOICE_PLAYER` goes.
- **Send:** a white circle `bg-ys-text text-ys-bg` with `DynamicIcon
  name="Play"` (▶). **Stop** is the same circle with ■ and the spinning ring.
- **Chips:** `border border-ys-border text-ys-text` outlined pills.
- **Couch switcher, turn lobby and party strip:** classes swapped to tokens;
  layout unchanged.
- **Layout:** one row, `[textarea | ( ) | 🎙 | ▶]`, the buttons 36 px and
  inside the bar. The textarea still grows to 140 px, and the
  `safe-area-inset-bottom` padding stays.

## 7. Slice 6 — the play modals and strips take the tokens

The classes are swapped to `ys-*` tokens. Behaviour and layout don't change.
- `AskQuestionModal.tsx`
- `ManualRollModal.tsx` (including the hard-coded `#7c3aed`)
- `DiceThrowModal.tsx` (its chrome; the 3D dice keep their own colours)
- `ConfirmDialog.tsx`
- `SyncConflictModal.tsx`
- `PartyLobby.tsx` (the QR code stays black on white)
- `TurnLobbyOverlay.tsx`
- `PartyTableStrip.tsx`
- `CombatDisplay`
- `NPCReactionToast.tsx`
- `OOCChatPanel.tsx`
- `TTSControls.tsx`
- `PlayerBubbles.tsx`

`ConfirmDialog` is also used off the story screen. Because the tokens live on
`:root`, it takes the theme everywhere, which is harmless.

## 8. Slice 7 — docs, screenshots, checks

- **`CLAUDE.md`:**
  - The directory map loses `StoryTabBar.tsx`.
  - "Pictures in play" notes that Regenerate is in the full-screen view.
  - Add a line under Conventions: story-screen chrome uses the `ys-*` tokens,
    not `purple-*` or `blue-*`.
- **`docs/story-screen-design.md`**: status changes to built, with the PR
  number.
- **`docs/status-report-2026-10-20.md`**: nothing; nothing it lists changes.
- **`docs/devlog/2026-10-2x-story-screen.md`**, before and after, at 375 px
  and at desktop width:
  - Ink;
  - Paper White, which proves the chrome follows a light theme;
  - Sepia;
  - a turn with rolls, folded and expanded;
  - the turn actions open;
  - the OOC toggle on;
  - recording;
  - the menu sheet;
  - couch co-op with two players;
  - combat on.
- **`docs/pending_tests.md`**, the checks this machine can't do:
  - **Android:** the reading font should be Noto Serif. A sans-serif font
    would mean the stack fell through.
  - **Android, the keyboard:** opening it with the composer focused should
    keep the bar on screen above it.
  - **Android, the mic:** the 🎙 in the bar should ask for the microphone
    once, then record (this is the #223 permission path).
  - **iOS:** the same three, once a Mac build exists.
- **Checks** (the `verify` skill):
  - the suite and `tsc`, against the baseline; the count moves by the three
    new test files only;
  - `eslint` on every touched file, no new problems;
  - `node scripts/build-standalone.mjs`;
  - the preview walk-through above.
  - No `tauri build` is needed (nothing native moves), but the APK is the
    real test of the phone layout, so offer one to the author when the PR is
    up.
- **No model calls.** The preview walk-through uses saved stories (*The
  Hollow Hour* and a couch co-op save); a played turn needs the author's go.

## 9. Calls this plan made

1. **The menu is an overlay, not a page** (`menuOpen` alongside
   `currentState`). Every `MenuPage` handler and modal is reused as is, and
   the story stays mounted underneath, so auto-narrate and the live turn
   aren't interrupted.
2. **The old backdrop stays behind the Notes, NPC and Goal pages.** Putting
   them on a white Paper White page would break "keep their look" (§8.5).
3. **While a turn streams, the work line stays collapsed.** Today the
   streaming thinking text opens by itself. The design's quiet page needs it
   shut, and a tap still opens it.
4. **The rendering moves into `StoryTurn.tsx`** and the pure helpers into
   `app/story/`. `story.tsx` shrinks by about 700 lines, and nothing in
   `app/misc/` moves.
5. **The `--story-*` vars are kept for one release**, set alongside the new
   ones, for a synced older device. A follow-up deletes them.
6. **`ChoicesModal` is still rendered and still unreachable** (§8.6). This
   plan doesn't touch it.
7. **A solo voice turn lands in the input to be read and sent, not sent by
   itself.** This keeps the review step today's queue gives (slice 5).

## 10. Review

Codex (gpt-6.1-sol, high) reviewed this plan on 2026-10-23. All 13 findings
were checked against the code and kept, and each is folded into the slice it
belongs to:

- shortcuts behind the sheet, plus focus;
- solo voice sending by itself;
- the slim player vanishing on pause;
- the recording bar's fixed position;
- the menu's own scrolling;
- OOC chat under the sheet;
- multi-pool and opposed roll headlines;
- several speakers in one part;
- keyboard access to the turn actions;
- the story's own sans-serif fallback;
- the menu body and `StoryImage` on light themes;
- the narration-source rule;
- `ChapterNav`'s dropdown.

None was dropped.

## Decisions made during implementation

### 2026-10-23, slice 3

- **`formatTurnWork(summary)` added to `turnWork.ts`**, beyond the plan's two
  exports: it owns "at most two headlines, then +N more, then the counts", so
  the rule is tested and `TurnWorkLine` only displays it.
- **Speaker prefix needs a space after the `>`** (`> Ana: …`). A solo part is
  stored as `>I say: hello` (the page prepends a bare `>`), so without that
  rule the colon in ordinary solo text read as a speaker name. Both couch
  writers (the composer and `buildTurnText`) put the space there.
- **An OOC segment's `body` has its outer brackets removed**; the "to the GM"
  tag carries the meaning. `isWrappedInParens` is exported and shared with
  `wrapOutOfCharacter`.
- **Multi-pool headlines:** a pool with one die shows `formula = total`; a pool
  with several dice shows `formula: faces` and no sum (`2d10: 3, 8`), so a
  system that rolls dice against each other never reads as one total.
- **An errored roll (`[ERROR …]`) is not a roll**: `rollHeadline` returns null
  and the call counts as an ordinary tool.
- **`TimelineView` gained an `only` prop** (`"text"` or `"work"`), so the prose
  and the expanded pills render from one list in their original order.
- **A streaming thinking pill no longer auto-expands** (the plan said so); the
  pill's own override still works once the turn is saved.
- **Edited turns:** `handleEdit` writes `content`, so `narrationCameFromGMStage`
  compares the rebuilt GM text with the edited `content`, fails, and the turn
  shows `content` through `prettify` (the edit), with the rebuilt blocks
  contributing only their pills. Tested in `tests/storyTurn.markup.test.tsx`.
  An edit that only changes whitespace still matches and shows the same text.
- **`stripNode` helper in `StoryTurn.tsx`** replaces the destructured unused
  `node` props in the markdown components (ten lint warnings in a new file).
- **Regenerate in the full-screen picture closes the dialog** before it runs.

### 2026-10-23, slice 4

- **The icon is `Ellipsis`**: lucide's `icons` map has no `MoreHorizontal`
  (it is an alias only the named export carries), and `DynamicIcon` looks the
  name up in the map.
- **The keydown listener skips buttons only for Enter/Space**, not wholesale.
  An early return for any button target would also drop Ctrl+Z, Ctrl+R and
  the arrows after the player pressed Retry or Edit, which the plan says stay.
  The check is `closest('button, a, [role="button"]')`, so a mention span
  (`role="button"`) is covered too.
- **Tap detection (`isTurnTap`, `StoryTurn.tsx`)**: GMTurn's `onClick` calls it
  with the event target and `window.getSelection()?.toString()`. A non-empty
  selection is not a tap; a target inside `button, a, [role=button], img,
  video, [data-no-turn-tap]` is not a tap. The picture block and the work line
  carry `data-no-turn-tap`. It duck-types `closest` so the node-env test can
  call it.
- **A tap outside closes the row** with a document `click` listener that
  ignores clicks inside any `[data-turn]` (a tap on another turn is that turn's
  own toggle). **Scrolling closes it** from the feed's scroll listener, except
  the scroll the page makes itself to keep a just-opened row under the latest
  turn in view (`ignoreScrollRef`, cleared on the next animation frame).
- **A new turn starting closes the row** by adjusting state during render when
  `loading || loadingStage` flips on (an effect would be a lint error,
  `set-state-in-effect`).
- **Slim visibility** needs no new state: `variant === "slim"` renders nothing
  when `!hasController || centerTitle === "Replay"`. `hasController` is
  `isPlaying || isLoading || isMuted || hasAudio`, and `centerTitle` is
  "Replay" exactly when nothing is active or muted and `finishedRef` says the
  playback ended; reading the ref again in render would add lint errors.
- **`controlHandleRef` calls `handleToggle`**, the function the idle button's
  `onClick` is. Pressed while narration plays it pauses, like that button.
  The Read aloud action is offered for the latest turn when `storyText` is
  non-empty and `isTTSEnabled()` (now exported) is true. The page-side
  callback (`readAloud`) is a `useCallback` over the ref; passing it through a
  helper made the ref lint rule fire on the feed's `map`.
- **Hit areas**: the "Turn actions" button is a 24 px target with the icon,
  dim (40%) until hover or focus, not the 40 px of the row's buttons; it sits
  beside a text line that is itself small.

### 2026-10-23, slice 5

- **`useVoiceRecorder<P extends { id: string }>()` lives in
  `app/components/useVoiceRecorder.ts`**, with `isSttEnabled()` (the
  `sttEnabled` key, default on). It is a move of `PlayerBubbles`' recorder
  (teardown, `transcribe`, `handleRecordingStopped`, stop, cancel,
  `watchSilence`, `beginRecording`) with `activePlayerId` and
  `processingPlayerIds` renamed `activeOwnerId` and `processingIds`. What a
  transcript becomes is the caller's: the bubbles' `onTranscript` builds the
  same `PendingLine` as before; the composer's appends to the draft. The one
  structural difference: `PendingLine` is built in a callback the hook calls
  after `await transcribe`, where it used to be built inline in the same
  place. Same order of `onLocalActivity`, floor take and release, and toasts.
- **`RecordingOverlay` takes `player: Pick<CouchPlayer, "name" | "color">`**
  (the composer has no `CouchPlayer`; its stand-in is `SOLO_RECORDER`, in
  `var(--ys-accent)`). Its colours and `LiveWaveform`'s bars already take the
  tokens, because the inline bar sits in the token-coloured composer.
- **`app/story/composerDraft.ts`** (`appendTranscript`, `stillVoice`) is the
  pure part of "transcript goes into the draft", tested in
  `tests/composerDraft.test.ts`. Clearing the draft to nothing drops the voice
  mark.
- **`inputKind`:** `onActionConfirm` (typed text) has no voice kind and
  `handleActionConfirm` never reaches `handleCustomInput`, so a voice draft
  goes through `onCustomInput(text, undefined, undefined, "voice")`: the
  route the bubble used. `speakerIds` is `undefined`, not `["solo"]` as the old
  solo bubble sent (nothing reads a solo id: the spotlight ledger ignores
  stories with one player). Typed text keeps `onActionConfirm`.
- **The mic reads `sttEnabled` during render** (`isSttEnabled()`), like
  `isTTSEnabled()` elsewhere; the composer re-renders on every keystroke and
  the story page is client-only.
- **OOC and a voice draft** combine: the transcript is wrapped, and the voice
  note is still added.
- **Icons:** `Mic`, `Play`, `Square`, `Check`, `X` are in lucide's `icons`
  map. The OOC toggle is the text `( )`.

### 2026-10-23, slice 6

- **Primary buttons are `bg-ys-text text-ys-bg`** (the composer's send) on both
  themes; the old purple-to-indigo gradients, blue fills and their coloured
  shadows are gone. Tinted fills with `text-ys-text` stand in for pale coloured
  text, which a light theme can't read.
- **Semantic colours stay, one step stronger:** red for danger and stop, green
  for "newer" and success, amber for the sync warning and the party banner's
  tint, and `CombatDisplay`'s stat and combatant colours (red, blue, orange,
  purple, green, yellow). Their text moved from the 300/400 shades to 500/600,
  which read on both Ink and Paper White.
- **`ConfirmDialog`'s default button is the theme's primary** and no longer a
  default class string. A caller's own `confirmButtonClass` (red, orange, blue,
  gray) is a coloured fill, so it gets `text-white` added by the dialog.
- **A "for Name" chip in the ask and roll modals** takes the player's colour
  with white text when the name matches a player; with no match it is
  `bg-ys-text text-ys-bg`, replacing the hard-coded `#7c3aed`.
- **`DiceThrowModal`'s scrim is `bg-ys-bg/85`**, not `bg-black/80`, so its text
  follows the theme. The dice keep their own colours; whether they stay legible
  on a light scrim is a screenshot check.
- **`PartyLobby`:** the QR stays black on white; the interface `<option>`s take
  the surface colours. **`TurnLobbyOverlay`'s** fallback player colour is
  `var(--ys-muted)`.
- **`TTSControls`'s bar variant** uses the same token classes as the slim one
  (only layout still differs). **`PlayerBubbles`:** the discs stay player-coloured
  with white icons; the Generate bubble, the queue panel and the recording bar
  take tokens.
- **`NPCReactionToast` lost its `dark:` classes**; the tokens carry the theme.
