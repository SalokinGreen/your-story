# The story screen, simplified — design

2026-10-22. Status: **approved (decision 116)**; plan in [`story-screen-plan.md`](story-screen-plan.md). Decisions 112–117.
The implementation plan (files, slices, tests) is a separate document, written
after this one is approved.

## Why

The author showed two phone screenshots of OOC, another AI story app, and said
"Let's work on the game UI. I like how simple OOC is." Side by side at 375 px:

| | OOC | Your Story today |
|---|---|---|
| top | one row: back, title, a quality picker, ☰ | a tab bar (Story / Notes / NPCs / Goals / ⚙), then a title strip with sync, chapters, an objectives strip and combat |
| story | one continuous page in a book serif; pictures full width between paragraphs | each turn in a purple "Game Master" card with an avatar, a tier badge, thinking and tool pills; player turns in blue bubbles; older turns dimmed to 50% |
| bottom | one bar: input, three small buttons, ▶ | an action bar (Undo, Retry, Edit, Illustrate, TTS), choice chips, the composer with a purple send button, and a floating 64 px purple mic bubble over the story |
| colour | near-black and white | blue-to-purple gradients; the eight reading themes colour only the story card and the prose, never the chrome around it |

Every one of our controls does something, so this is a reorganisation and a
restyle. Nothing is removed. Each control either moves somewhere else or stays
where it is. The full inventory (every control, file:line and when it shows)
was taken on 2026-10-22 and is summarised in §6.

## The decisions (from the interview, `decisions.md` 112–115)

- **112** — take all four from OOC: a plain prose page, one slim header, quiet
  colours, and a composer with small buttons.
- **113** — no model or quality picker in the header. The tiers change by
  themselves each turn (decision 50), so one picker in the header would
  mislead. It stays in Settings.
- **114** — design for the phone first. The desktop app uses the same layout
  in a centred reading column.
- **115** — the composer gets two buttons, **Talk to the GM** and the
  **microphone**. A turn's own actions show when the player taps the latest
  turn.

## 1. The header

One row, 52 px high, the same on every tab:

```
 ‹   The Hollow Hour                                   ☰
```

- **‹** goes back to the Library, as today.
- **The title** is the story name in the reading font, truncated.
- **☰** opens the **story menu** (§4). A small dot on it means something
  needs attention: a sync conflict, an online session, unread OOC chat.

The tab bar and the title strip are gone from the top. Their contents move:

| today | moves to |
|---|---|
| tabs Notes / NPCs / Goals | the story menu; each opens full screen with ‹ back to the story |
| ⚙ Menu tab | the story menu *is* that menu |
| chapter jump "Ch. N ▾" | the story menu, "Chapters" |
| objectives strip | the story menu, the Goals row, with the active count shown on the row |
| sync indicator, net status badge | the top of the story menu; a problem also shows as the dot on ☰ |
| combat display | **stays** under the header as a slim strip while combat is on. The player needs it in play. |

## 2. The story page

The story reads as one page, as in OOC.

- **GM prose** runs full width with 16 px gutters. There is no card, no
  avatar and no "Game Master" label. Turns are separated by space, not by
  borders.
- **The player's action** is a short line above the GM's answer: muted
  colour, a thin rule on its left, in the UI font. So the page reads as
  *you did → the world answered* without chat bubbles. In couch co-op the
  line carries the player's name in their colour.
- **Pictures** run edge to edge, between the action and the prose they belong
  to, with no frame. Tapping one opens it full screen, as today. Regenerate
  and the cost move into that full-screen view.
- **Older turns** are no longer dimmed.
- **The GM's working** (the thinking and tool pills) folds into **one quiet
  line per turn**, e.g. `⚄ 2 rolls · 3 notes read`. Tapping it opens the
  pills as they are today. A roll's result is shown in the line itself
  (`⚄ Iron 5 vs 3, 8 — weak hit`), because a player wants to see their dice.
  A GM roll behind the screen stays hidden, as now.
- **Hidden `||…||` text**, the dotted note and NPC mentions, the edit panel
  and the Observer's "not final yet" caveat behave as they do today, restyled
  to the quiet colours.

### Turn actions on tap (decision 115)

The bar under the feed goes. When the player taps the **latest turn**, a
small row of icons appears under it: **Retry, Undo, Edit, Illustrate, Read
aloud**. Each icon shows only when it does today (Undo when there is a
snapshot, Illustrate with a picture key, and so on). Tapping elsewhere or
scrolling hides the row. An earlier turn shows **Edit** only. The keyboard
shortcuts (Ctrl+Z, Ctrl+R) stay.

While a turn is being read aloud, a slim player (pause, the seek bar)
appears above the composer and goes away when it ends. Auto-narrate is
unchanged.

## 3. The composer

```
 [ What do you do?                         ( )   🎙   ▶ ]
```

- **The input** is today's textarea, restyled. Enter sends and it grows as
  you type. The placeholder still says what the GM is doing
  ("GM is thinking…").
- **( ) Talk to the GM.** A toggle. When it's on, the bar is outlined in the
  accent colour, the placeholder reads "Talk to the GM, out of character…",
  and the message is sent wrapped in (round brackets). The GM prompt already
  treats round brackets as out-of-character (`ai_staged.ts` "OUT-OF-CHARACTER
  (OOC) COMMUNICATION"), so this needs no engine change. It turns itself off
  after one message. On the page, the message shows in the player's line in
  italics with a small "to the GM" tag.
- **🎙 Microphone.** This is the solo voice input, moved inside the bar. It
  replaces the floating purple bubble. Tap to record, and today's recording
  bar (cancel, waveform, confirm) shows in place of the input. With Speech
  Input off in Settings the icon isn't shown.
- **▶ Send**, a white button. While a turn runs it becomes **■ Stop**.
- **Choice chips** stay above the bar when there are choices (the starting
  choices, or the choices setting), restyled as quiet outlined pills.
- **Couch co-op** keeps its speaker switcher above the bar. It also keeps the
  per-player voice bubbles, because several people talking into one phone is
  what they are for. Only the single-player bubble moves into the bar.
- The turn lobby (online co-op) and the party table strip (desktop) stay
  above the composer, restyled.

## 4. The story menu (☰)

On the phone it's a bottom sheet. In the desktop app it's a panel on the
right. In order:

1. **Status**: sync state, online room or party, the OOC chat button with
   its unread count.
2. **Notes · NPCs · Goals · Chapters**, one row each, with counts.
3. **Story**: Story Editor, Save, Save Copy, Export, Compact Story.
4. **Settings**, which opens today's Settings.
5. **For the curious**: AI Context, Debug Logs.
6. **Danger**: Restart, Delete.

Player Notes and Chat Display Settings (display name, avatar) move into the
Story Editor's Basic tab. The menu page's header (story name, % complete,
counts) is dropped. The rows carry the counts.

## 5. Quiet colours

- **Colour tokens.** The story screen's chrome stops using hard-coded
  `purple-*` and `blue-*` classes and reads six CSS variables: background,
  surface, text, muted text, border, accent. Each reading theme sets all six,
  so a theme colours the whole screen, header and composer included. Today
  the light themes leave dark chrome around a light page.
- **A new default theme, "Ink"**: background #121212, surface #1c1c1c, text
  #ececec, muted #9a9a9a, accent a warm off-white. It is what OOC's
  screenshots look like. A player who saved a theme keeps it. The other
  eight presets get the extra three tokens, worked out from their three
  colours.
- **The accent** is used only where something needs the player: an active
  toggle, the OOC outline, a pending roll, the dot on ☰.
- **The reading font defaults to serif**: `Georgia, 'Noto Serif', serif`. That
  is Georgia on Windows, macOS and iOS, and Noto Serif on Android, so nothing
  has to be bundled. The UI (header, composer, player lines, menu) stays
  sans-serif. The font settings apply as today, and now also to the player's
  lines and to headings in the prose.
- The modals that open from play (the dice roll, the GM's question, the dice
  tray, confirm) take the same tokens in this change. The Notes, NPC and Goal
  pages, Settings and the Library are **out of scope** and keep their look
  for now.

## 6. Where every control goes

| region today | control | after |
|---|---|---|
| top bar | ← Library | header ‹ |
| top bar | tabs Story/Notes/NPCs/Goals, ⚙ Menu | ☰ story menu |
| title strip | story name | header title |
| title strip | sync, net badge, chapters, objectives | story menu (§1 table) |
| title strip | combat display | stays, as a slim strip under the header |
| per turn | GM card, avatar, name, tier badge | removed. The tier badge moves into the GM's-working line, and its tooltip stays. |
| per turn | thinking and tool pills | the one GM's-working line, which expands to the pills |
| per turn | prose, mentions, hidden text | unchanged, restyled |
| per turn | pictures, Regenerate, Retry | full bleed. Regenerate and the cost go in the full-screen view; Retry stays on a failed card. |
| per turn | player bubble | the player's action line |
| under feed | Undo, Retry, Edit, Illustrate, TTS | the row shown when the latest turn is tapped, plus the slim player while reading aloud |
| above composer | choice chips, couch switcher, turn lobby, party strip | stay, restyled |
| composer | textarea, send, stop | restyled; ▶ and ■ |
| overlay | solo mic bubble | 🎙 in the bar |
| overlay | couch voice bubbles, queue, Generate | unchanged |
| overlay | OOC chat edge tab and panel | the panel stays; the edge tab goes, and it opens from the story menu, with unread count shown as the dot on ☰ |
| overlay | NPC reaction toasts, app toasts, guest banners | unchanged, restyled |
| modals | roll, question, dice tray, confirm, sync conflict, party lobby | unchanged in behaviour, restyled |
| menu page | every action | story menu §4 |

## 7. What this does not change

- No engine change. The GM, the tools, the prompt and `StoryData` stay as
  they are. The OOC button only wraps text in brackets the prompt already
  understands.
- No new setting, apart from the tokens each theme carries.
- Party mode's phone page (`app/party/`) is out of scope.

## 8. Calls made in this design, for the author to check

These weren't asked in the interview. Each is the option I'd pick. Change any
of them before the go.

1. **The GM's working folds into one line** (§2), rather than vanishing
   completely. Rolls are part of the fun, and the pills are how a player sees
   the engine was fair.
2. **The player's action shows as a muted line** above each answer. OOC's
   screenshots show no player text, but without it a saved story can't be
   followed back.
3. **Ink becomes the default theme** for new players only. Anyone who saved a
   theme keeps theirs.
4. **Couch co-op keeps its floating voice bubbles.** Only solo play moves the
   mic into the bar.
5. **Notes, NPCs, Goals, Settings and the Library keep their current look**
   for now. Restyling them is a follow-up, once the story screen is right.
6. **The dead `ChoicesModal`** is unreachable (nothing opens it). It is left
   alone here, and whether to delete it is a separate small change.
7. **Editing an earlier turn**: today Edit acts only on the last turn. Offering
   it on earlier turns needs the edit handler to take any index. The
   implementation plan checks that `handleEdit` (`app/story/page.tsx`) and the
   undo snapshot cope with it. If they don't, earlier turns get no actions.
