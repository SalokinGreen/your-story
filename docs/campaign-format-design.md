# The campaign format — design

**Status:** design, for the author's review. Not approved for building.
Decisions 222–225 and 197–198 (`docs/decisions.md`). Research:
[`research/adventure-design-2026-10-25.md`](research/adventure-design-2026-10-25.md)
(how campaigns are prepped and run) and
[`research/campaign-and-judges-audit-2026-10-25.md`](research/campaign-and-judges-audit-2026-10-25.md)
(what exists today). The judge side is
[`judge-layer-v2-design.md`](judge-layer-v2-design.md). The implementation
plan comes after approval.

## 1. What is wrong today

A campaign today is a **beat spine**: a `gm_plan` note listing preset beats the
GM advances with `advance_plan`, plus loose threads, goals and countdown
timers.

**The spine itself:**
- **It suits only one kind of campaign**, the adventure path. A sandbox, a
  mystery or a slice-of-life season has no fixed beats.
- **It only grows.** `advance_plan` appends, so the pinned note gets longer
  every beat.
- **Creating it depends on a title regex.**
- **Its beat names are preset strings.**

**Clocks, fronts and progress:**
- **Nothing ticks.** `auto_advance` timers never tick.
- **Fronts are only a prompt convention.** A front is a thread, a timer and a
  line in the plan, and the field that would link them has no writer.
- **`storyProgress` is always 0,** so the director's arc pressure is dead.

**Secrets and style:**
- **Two overlapping secret mechanisms:** the `secret` note type and note
  visibility.
- **Hidden text reaches the narrator** (§6.16).
- **Style notes never do** (§6.22).

**Who builds it:**
- **No starter ships a campaign.** The GM writes one from scratch in every
  session zero.
- **The Designer can't author one.** Its prompt doesn't mention session zero
  or the plan.

The research points the other way. Experienced GMs prep **situations, not
plots** (the Alexandrian): what each faction wants and does if nobody stops
it, secrets with several clues each, locations, people with wants, and a
strong start. The game moves through **fronts and clocks** that advance
whether or not the players engage (Dungeon World, Blades in the Dark).

## 2. The idea in one paragraph

A campaign is a **structured campaign record** in the story, not a prose note.
- **It is built from parts**, and a **style** picks which parts a campaign uses
  (decision 222).
- **The engine owns the record.** Clocks tick by rule (decision 223), secrets
  and clues know whether they've been found, and lines and veils are stored as
  data (decision 225). That is what lets the judges check against it
  (`judge-layer-v2-design.md`).
- **The GM sees a compact brief every turn,** and reads the long detail on
  demand.
- **Three authors write the same record:** the GM in session zero, the Game
  Designer, and the starters, which ship it built (decision 224).

## 3. The parts

Every part is optional; a style decides which are expected. **Engine-tracked**
means the engine reads or changes it; the rest is text for the GM.

| Part | Holds | Engine-tracked | From |
|---|---|---|---|
| **Pitch** | Premise; 2–4 tone words; the style | — | Session zero |
| **Lines and veils** | Lines never appear; veils happen off screen | Yes: carried every turn, checked by a judge | Safety tools (decision 225) |
| **Starting situation** | The authored opening, played after setup | Already: `StoryData.intro` (decision 197) | Lazy DM's strong start, made an arrival |
| **Factions** | Name, goal, methods, a clock | Clock | Blades in the Dark |
| **Fronts** | Name; 1–3 dangers (each with an impulse); grim portents in order; an impending doom; 1–3 stakes questions; a clock | Clock and portents | Dungeon World |
| **Clocks** | Name, segments (4, 6 or 8), filled, triggers, what it is linked to, what happens when full | **Yes: the engine ticks them** (§4) | Blades; replaces countdown timers |
| **People** | The existing NPCs plus **want**, **secret** (hidden) and **voice** | Secret is hidden from players and the narrator | Lazy DM; the Alexandrian |
| **Secrets and clues** | Each secret: the truth (hidden), revealed or not, and its clues (each: text, where it might be found, found or not) | **Yes: found/revealed state, clue count** | The three clue rule |
| **Locations** | Name, three evocative features, who and what is there, its note | — | Lazy DM; Bryce Lynch's usability |
| **Threads** | The existing threads, linked to a clock | Clock link (fixes the dead field) | Mythic |
| **Beats** | Ordered beats with a current beat; **adventure-path style only** | Current beat (the spine, fixed: replaces, never appends) | Today's spine |
| **End states** | 2–4 possible conclusions, reached by play | — | DW stakes; the Alexandrian |
| **Tables** | The existing `table` notes | Rolled by the engine | Mythic, Ironsworn |

## 4. Clocks the engine ticks

A clock has 4, 6 or 8 segments and **triggers**, chosen from:

| Trigger | When the engine ticks it |
|---|---|
| `miss` | A graded miss this turn: `action_roll`, `feat_roll`, `progress_roll` or a recorded challenge failure. |
| `scene` | `increment_scene`. |
| `rest` | `take_rest` or a Blood & Bone rest. |
| `session` | `end_session`. |
| `time` | When the story's in-world date moves on. Only if a later decision adds a calendar; off for now. |
| `manual` | Only the GM ticks it. |

**What the engine does:**
- **One tick per trigger per turn**, so a turn of three misses ticks a
  `miss` clock once.
- **Reports the tick in the turn's results:** "Clock 'The Drowned King wakes'
  4/6. Portent reached: the river runs backwards at night."
- **Puts the next portent in the live block.**
- **Says so when the clock fills,** and the doom or the faction's goal lands.
  The GM narrates it; the engine never writes prose.

The GM can also tick, untick or pause a clock with the campaign tool, giving
a reason, as fiction demands.

**What this replaces.** Countdown timers become clocks. An existing timer is
migrated on load into a `manual` clock with the same count, and
`manage_timer` stays as an alias so old saves and the GM's habits keep
working. **This fixes §6.1 and §6.2.**

## 5. Styles

Session zero asks for a style (a new table step), and the style says which
parts the GM must build before `confirm_setup`, and which to offer.

| Style | Expected parts | Typical clock triggers |
|---|---|---|
| **Sandbox** | Pitch, factions, fronts, locations, people, secrets, tables | `scene`, `rest` |
| **Adventure path** | Pitch, beats, fronts, people, secrets, end states | `miss`, `scene` |
| **Mystery** | Pitch, secrets with three clues each, people with secrets, a front, end states | `scene`, `miss` |
| **Horror** | Pitch, lines and veils, a front with grim portents, people, secrets | `miss`, `scene` |
| **Episodic** | Pitch, one front per episode, locations, people | `scene` |
| **Slice of life** | Pitch, people with wants, locations, small clocks, threads | `session`, `rest` |
| **Solo / oracle** | Pitch, threads, people, tables; the Mythic lists drive it | `scene` |

A built-in system or starter may preset the style. Grave Watcher is slice of
life; The Hollow Hour is a one-night mystery.

**Authoring checks** run when the campaign is written:
- a mystery secret with fewer than three clues;
- a front with no clock;
- an expected part missing.

They are shown to the author in the Designer, or to the GM in session zero.
They are prep rules, so they warn, never block (research §7).

## 6. What the GM sees

The cache rule holds: anything that changes per turn goes in the live block.

- **Every turn, in the live block: a campaign brief,** compact, at most about
  800 tokens:
  - the style;
  - tone, lines and veils;
  - each clock with its fill and next portent;
  - the current beat (adventure path);
  - unrevealed secrets as titles, with clue counts ("2 of 3 clues found");
  - stakes questions;
  - people in the current location with their want.
- **On demand:** each faction, front, person, location and secret in full,
  through `read_notes`-style reads of the campaign (`read_campaign`, or the
  campaign tool's read action).
- **Never to the narrator:** secrets, NPC secrets, unfound clues. The narration
  call gets the turn's visible prose and the tone. This fixes §6.16 by
  construction, and also calls `stripHiddenLoreContent` where history carries
  hidden text.
- **Style notes reach the narrator.** `story_instructions` join the narration
  call (fixes §6.22).

## 7. The tools

One GM tool, **`campaign`**, keeps the tool budget in check. Its actions:
- **reading:** `read`;
- **clocks:** `tick`, `pause`;
- **secrets and clues:** `reveal_secret`, `place_clue`, `find_clue`;
- **fronts and beats:** `advance_front`, `set_beat` (adventure path; it
  replaces the current beat, never appends);
- **building:** `add` and `edit` for any part, in session zero.

Notes:
- **Building in session zero.** The GM builds the campaign with `add`, which
  replaces writing a plan note. A `gm_plan` note written by older habits is
  read as the pitch and beats, so old saves keep working.
- **`advance_plan`, `open_side_beat` and `close_side_beat`** are kept as
  aliases onto `set_beat`, and a later cleanup removes them.
- **The Designer** gets the same parts through its own tool, `write_campaign`,
  with the same validation. Its prompt is rewritten to say what session zero
  does, what the campaign is, and that lore is read by title, not keyword.

## 8. Session zero

The existing walk-through (decisions 142–148) stays. It gains three table
steps, plus a fourth for a starter:

| Step | Asks for |
|---|---|
| `style` | The campaign style. |
| `tone_safety` | Tone words, lines and veils. Asked plainly, with examples. "None" counts. |
| `campaign` | Building the campaign, now meaning the expected parts of the style. |
| `campaign_review` | Starters only: the GM summarises the shipped campaign's non-secret parts and asks what to change. |

**The setup card** (`confirm_setup`) shows the pitch, tone, lines and veils, the
style, and the non-secret parts (factions, fronts' names, locations, stakes
questions), beside the sheet. Secrets never appear on the card. They are
still hashed for the approval, so editing a secret after approval cancels it.

`start_game` refuses until the style's expected parts exist, as it refuses
today without a plan.

## 9. Starters ship complete campaigns (decision 224)

Each built-in starter gains a full campaign record:
- **The Hollow Hour:** a mystery. A Heat front, Runa's secret with three clues,
  Callum's clock.
- **Grave Watcher:** slice of life. The town calendar as small clocks, the
  Old Lot front, the regulars' wants, the season's secrets with clues.
- **The Last Resort:** a sandbox in a hotel. Factions among the dead, a
  boiler-room front, Winnie's secrets.
- **Wolfwillow Crossing:** an adventure path. The barrow king's front and the
  Lantern Eve beats.

Their "Running it" notes shrink to what the record cannot say.

## 10. The player's view

The player sees:
- the pitch, tone, lines and veils;
- the clocks marked visible (a clock can be hidden);
- the goals;
- the found clues, as "What we know".

They never see secrets, unfound clues, fronts' dooms, or the factions' clocks
unless they are visible.

The views that apply the same rule:
- **The party-mode phones:** `buildPlayerView` gains these fields, and its
  redaction test extends to them.
- **Online guests:** the existing §6.12 leak is not fixed here, and is named
  as a known gap.

## 11. Migration and old saves

- **The campaign record is optional** on `StoryData`, and its absence means
  today's behaviour.
- **An old story with a plan note** keeps working: the note is read as the
  pitch and beats.
- **Countdown timers** become `manual` clocks on load (§4).
- **Nothing is deleted from an old save.** Sync carries the record inside the
  story blob.

## 12. Slices (for the implementation plan)

1. **The record and clocks:**
   - the `Campaign` shapes;
   - the engine's clock ticking;
   - the timer migration;
   - the brief in the live block;
   - the `campaign` tool (read, tick and build);
   - fixes §6.1 and §6.2, and the always-zero `storyProgress` (now derived
     from beats, fronts and end states).
2. **Secrets and clues:** the narrator never receiving hidden text (§6.16), and
   `story_instructions` reaching it (§6.22).
3. **Session zero:** the style and lines-and-veils steps, the card, and
   `start_game` checks.
4. **The Designer:** `write_campaign`, its rewritten prompt and the authoring
   checks.
5. **The starters:** four campaigns, prose for the author to read.
6. **The player's view and party redaction.**

Each engine slice gets the `engine-review` agent; the tool budget test holds
the one new tool.

## 13. Open questions for the author

- **Should `time` be a clock trigger?** That needs an in-world calendar,
  which the app does not have.
- **Should the player see the clocks by default?** Blades shows them; a
  horror campaign hides them.
- **Do Blood & Bone's meters (Heat, Unrest, Vacancy) become clocks,** or stay
  meters? Proposed: stay meters. They move both ways, and clocks only fill.
