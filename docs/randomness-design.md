# Real randomness for the GM — design

Status: **design, for the author's review** (2026-10-26), revised after
Codex's review (§9). Decisions 259–262. Nothing here is built. The
implementation plan is a separate document, written after this one is
approved.

## 1. The problem

The author: "the GM should use the tables a lot more for randomness because
LLM randomness isn't random enough."

What the code does today:

- **The model alone decides whether anything random happens.** The system
  prompt already says "Tables (USE THEM - DON'T JUST IMPROVISE)" and "roll it
  rather than inventing the answer" (`ai_staged.ts` 2438–2443, 2052–2054).
  That is prose pressure only. The one forcing check, the M2 roll gate, covers
  contested scenes only, and the GM may decline it.
- **A table note costs three calls.** The GM sees only a table's title, so it
  must `read_notes`, then `formula_roll` the die the note names, then read off
  the entry. `roll_table` rolls only the 45 built-in Mythic tables, and its
  description lists just 40 of them.
- **The engine's own randomness waits on the model.** The scene check, chaos
  drift, interrupted-scene events and the director's seeds all run only after
  the model calls `increment_scene`. A random event also comes from
  `fate_question` doubles, in 9% of calls.
- **The counts disagree.**
  - A table note rolled with `formula_roll` doesn't count as using the oracle,
    for the oracle-gap judge or for the "NEVER consulted" nudge.
  - The M2 gate counts `formula_roll` but not `roll_table` or `roll_portent`.
  - `GOOGLE_ESSENTIAL_TOOLS` omits `roll_table`, `generate_name` and
    `resolve_random_event`.
- **Names are the model's own.** `generate_name` returns only pointers (a
  first letter and syllables), and the model still writes the name.

**The eval of 2026-10-26** (`research/model-eval-2026-10-26.md`) found two
oracle misses that every model shares:
- asking `fate_question` about a plain question an NPC would simply answer
  (GLM 5.3 5 of 5, Gemma 5 of 5);
- inventing what the notes don't establish. In the cellar case, DeepSeek V4
  Pro at `xhigh` did this 5 of 5 times, and the Flash models 2–3 of 5.

## 2. What real play and the research say

- **Mythic** pairs a yes/no oracle with two **meaning** words, an action and
  a description, as inspiration. It tests each new scene against the chaos
  factor, so a scene may come out altered or interrupted. Players decide what
  logically happens first, and roll for the surprise.
- **Ironsworn**'s Ask the Oracle says to take the obvious answer when there is
  one ("Your first instinct is often the right one") and to roll when there
  isn't. Its Pay the Price is a table of setbacks.
- **OSR** tables check for encounters on a schedule (OD&D: 1-in-6 per dungeon
  turn) or on **tripwires**, rolling "when it makes sense, not because it's
  time to" (Murkdice, after Cairn 2e). One die can do several jobs
  (Necropraxis's overloaded encounter die).
- **LLMs are poor randomisers.**
  - Hamilton & Mimno (2026): in 20,000 generated stories, three names
    ("Elias", "Mara", "Elara") covered over half the character names.
  - Models favour "7" when asked for a random number (West & Potts 2025).
  - A 2026 preprint finds they "lack a functional internal sampler".

  So randomness has to come from the engine's dice, with the model shaping
  the result.

## 3. The design

Five parts. Each is useful on its own, and they add up.

### 3.1 The dice drawer, very light (decision 259)

Once per turn, before the first GM round, the engine draws a small drawer and
puts it in the **live block**. It is **material, not orders**: the GM uses an
item only when the turn needs something new, and nothing checks whether it
did.

```
DICE DRAWER (rolled by the engine; use only what this turn needs)
Names: Ilse Varga · Tomas Ruel · Mother Hesk   Meaning: protect / ruined
```

- **What it holds:** three person names from the setting's name sources
  (§3.2), and one meaning pair (an action word and a description word, from
  the built-in meaning tables). Nothing else, to keep it light. Events come
  from §3.4, and everything else is a one-call roll (§3.3).
- **About 40 tokens a turn.**
- **One draw per turn.** It is drawn into turn-local state and handed
  unchanged to every round's prompt, to the context-overflow rebuilds and to
  the executors. A rebuild never re-rolls it, and the tool list and the cached
  prefix are untouched. The context viewer's preview shows a placeholder and
  never rolls.
- **Never stored, never shared.** The narrator, online guests and party phones
  never see it. The names it offered are remembered privately (§3.2), so a
  drawer name can be accepted later. Unused names are never shown to anyone.
- **Off for the whole of session zero,** including the turn that calls
  `start_game`.

### 3.2 Names only from tables (decision 260)

A new named person or place takes a name the engine rolled. The engine
enforces this where a name enters the record through a tool; prose gets a
flag only.

**Name sources** are declared explicitly. Nothing scans arbitrary notes for
names.
1. **A story's own name table.** A table note that is not built in, whose
   title contains "Names", with a person list and optionally a place list. It
   overrides everything below.
2. **The starter's or the system's declared sources**
   (`BuiltinSystem.nameSources`). Each has a kind (person or place) and a
   composition:
   - Blood & Bone's People → Names, a d100;
   - Grave Watcher's first name plus family name;
   - each Fantastic Realms realm's d20, chosen by the scene's realm, or the
     fallback when there is none.
3. **A built-in fallback.** Original person and place lists in a few styles.
   This is new text, never copied (decision 3). A story records its style
   once.

**A small private ledger** on the story holds the names the engine offered:
the drawer's names, `generate_name`'s three, and any name a table roll
returned, keeping the last 30. A name on the ledger is accepted. The ledger is
stripped from online snapshots and party views, like the drawer.

**Established names are accepted too:**
- everything already in the record when this ships, so old saves are
  grandfathered;
- the adventure's own material: Designer drafts, starters, presets and
  imported notes;
- **anything a player wrote**, in any channel: their lines (couch, party,
  online), question answers, their sheet, a preset they picked.

A note the GM created this turn does not count. That closes the loophole of
inventing a name in `create_note`.

**Where the check runs:**
- `add_npc`, and `update_npc` when it renames someone;
- `campaign` writes that add or rename a location. A `campaign` person links
  an existing NPC, so `add_npc` covers people.

A refusal never ends the turn. It comes back with three freshly rolled names.

**`generate_name`** returns three rolled full names, for a person or a place,
instead of pointers.

**Names written only in prose** can't be checked exactly. A cautious, free
rung-1 check flags a capitalised name that is in no record, no ledger and no
player text. It goes to the Debug Logs only. It never rewrites, and it never
asks for a rename that would break continuity.

### 3.3 Table notes in one call, where the layout allows (decision 259, "both")

- **`roll_table` rolls a table note** by its title, and by a sub-table heading
  when the note holds several tables. When more than one sub-table matches and
  no heading was given, the engine **refuses and lists them**. It never takes
  the first one silently.
- **A bounded parsing contract.** The engine rolls the layouts the shipped
  packs and the old-table migration actually use:
  - a die in the heading, or a "Roll 1dN:" lead-in;
  - numbered and ranged entries ("1–3.");
  - d66, as two d6 with the first read as tens;
  - nested headings, given as a full path;
  - an entry that runs over several lines.

  The result carries the entry plus the text around it, such as "roll
  again…" or a cross-reference, left unresolved for the GM.
- **Every other layout falls back** to today's read-and-roll, and the refusal
  says so. That covers the creation prompts' bold questions, multi-column
  tables and free prose. "Any table" does not mean any prose.
- **Visibility.** The narrator sees a note table's result only if the note is
  `always_reveal`. A hidden note's roll keeps a private result, as `gm_roll`
  does.
- **Finding tables.**
  - The 45 built-in table names move out of the tool description, into the
    system prompt's stable Tables section, compactly.
  - Each table note's sub-tables and dice show in the live block, inside the
    existing grouped list (`renderNoteTitleList`).
  - Both tool budgets are measured on the final lists. They are strict:
    under 10,000 tokens, and under 11,500 for Fantastic Realms.
- **What counts as table or oracle use:** only successful, identified table
  rolls (`roll_table` on a built-in table or a note) and oracle calls. A
  `formula_roll` is never counted because of a nearby read. The unused drawer
  doesn't count either. **The M2 roll gate stays as it is.**
- **Gemini** gets `roll_table`, `generate_name` and `resolve_random_event`.
  The engine review's "six places" check covers all three.
- **Instructions that would conflict are removed in the same change:**
  - the Tables section's read-then-`formula_roll` order;
  - Naming's "use the pointers";
  - `fate_question`'s "use it often; several a scene is normal".

### 3.4 Tripwires for surprises (decision 261)

**One policy for every surprise.** Mythic's interrupted scene and
`fate_question` doubles already add pending random events, each on its own,
up to five (`MAX_PENDING_RANDOM_EVENTS`). The tripwires join them under one
rule:

- **A tripwire rolls only on a quiet turn:** no event is pending, and no
  source added one this turn.
- **At most one tripwire roll per turn,** whatever crossed.
- **Events already queued** in old saves are drained as they are resolved,
  never cut.

The engine sees a crossing from **typed results** where they exist (the
events `campaign/events.ts` already derives), and from a cautious text check
otherwise:

| tripwire | how the engine sees it |
|---|---|
| a rest, or a session's end | a successful `take_rest` (systems that have it) or `end_session` |
| travel or time passing | a phrase check on the player's line and the GM's final prose, with the turn-end check matcher (`textCrosses`), requiring a completed crossing ("we ride to Esk", "by evening"), never a plan, a question, a negation or a memory |
| a long quiet run | 6 turns in a row with no identified table or oracle use (§3.3) |

A new scene keeps its own Mythic check and is not a tripwire.

- **The chance is 1 in 6 at chaos 5**, changing one step per two points of
  chaos:

  | chaos | 1–2 | 3–4 | 5 | 6–7 | 8–9 |
  |---|---|---|---|---|---|
  | chance | 1 in 8 | 1 in 7 | 1 in 6 | 1 in 5 | 1 in 4 |
- **A hit appears in the next turn's live block** as a pending event, with a
  focus and a meaning pair. It never forces an extra round in the turn that
  rolled it.
- **Off for the whole of session zero,** and for a repetitive round. Every
  roll, hit or miss, writes a Debug Logs line.
- **The combined rate**, judged against "too strong is too random":
  - Interrupted scenes (20% of scene changes) and `fate_question` doubles
    (9% per call) are unchanged.
  - The tripwires add at most about one event per six crossings, and only on
    turns where nothing else fired.
  - The eval measures the real rate in a played session before this ships.
    If it runs high, the chance is the one knob to turn.

### 3.5 The oracle step, reworded

The eval's shared misses come from step 3 of the roll chain. Step 3 gets one
clause and one example pair, within the system prompt's existing budget.

- **The clause:** "A person in the scene who knows the answer and would say it
  is not an oracle question: narrate what they say."
- **The example pair:**
  - "the innkeeper names the stranger" is narrated;
  - "what is behind the locked cellar door, which no note describes" goes to
    the oracle or a table.
- An established fact still stands (step 4).

## 4. What it does not do

- It does not decide outcomes for the GM. A drawer word or a rolled event is
  an input the GM shapes into the fiction, as Mythic intends.
- It does not force a roll on every turn. The drawer is optional, and the
  tripwires roll only on quiet turns.
- It does not touch a story's own dice system, the judges' severities or the
  narrator.
- It does not store the drawer. Only the private ledger of offered names (the
  last 30) and the pending events reach `StoryData`, and neither goes to
  guests or phones.

## 5. Risks

| risk | guard |
|---|---|
| Too much randomness ("too strong is too random") | The drawer is two lines and optional. Tripwires roll only on quiet turns, at 1 in 6, and the combined rate is measured before shipping. |
| Unused names or hidden table results leak | The drawer and the ledger stay private. A note roll's public summary follows the note's visibility. Boundary tests cover the narrator, online guests and party phones. |
| A table note is rolled wrongly | The bounded parsing contract, ambiguity refusals and the read-and-roll fallback. A test runs every shipped table note through the parser. |
| The tool list passes its budget | `roll_table`'s description gets shorter, and the built-in names move to the stable prompt. `tests/toolBudget.test.ts` holds both lists. |
| The name check refuses a fair name (one a player said, a pun, a title) | Exemptions by provenance (§3.2). A refusal never ends the turn and comes back with three names. |
| The cache stops hitting | The drawer is one draw per turn, in the live block only. The base messages stay byte-identical across a turn's rounds. |
| Old saves | Every new field is optional. Existing names are grandfathered, and queued events are drained, not cut. |

## 6. How we will know it worked

- **The eval runner saves each run's prose,** so a failure such as "prose
  lacks the toll-keeper" can be read, not guessed at.
- **New generation cases:**
  - a new NPC appears, and their name comes from the drawer or a roll;
  - a new room is entered whose contents no note describes, and a table is
    rolled;
  - a pending event is worked in and resolved;
  - a quiet turn with a full drawer, and nothing from it is forced in.
- **The oracle cases** (gossip and cellar) are rerun against the 2026-10-26
  numbers.
- **One played session,** on the author's go. It counts:
  - distinct names;
  - tables rolled per hour;
  - surprises per hour, from all sources.

## 7. Open questions for the implementation plan

- Which name styles the built-in fallback ships, and how many names each.
- The exact travel and time-passing phrase list. It can start from the dawn
  check's machinery.

## 8. Sources

From the research notes of 2026-10-26:

- **Mythic GME 2e:** the Word Mill product page (47 meaning tables).
- **Ironsworn:** Ask the Oracle and Pay the Price, from a rulebook copy of
  uncertain edition.
- **OSR:**
  - The Alexandrian, "Reactions to OD&D" (1-in-6 per turn);
  - Murkdice, "Tripwire or timer?";
  - Necropraxis, "Overloading the encounter die".
- **LLM randomness:**
  - Hamilton & Mimno (arXiv 2605.26492, names);
  - West & Potts (arXiv 2505.00047);
  - Zhang et al. (arXiv 2510.01171, typicality bias);
  - arXiv 2601.05414 (no internal sampler; seen as a snippet only).

The Mythic rulebook, the official Ironsworn text and the OSE core could not
be reached directly. The notes say which claims rest on secondary sources.

## 9. Revised after Codex's review (2026-10-26)

Codex (GPT-6.1 Sol) reviewed the first draft against the code. All ten of its
findings were kept.

1. **Name exemptions by provenance.** Old saves, the adventure's material and
   every player channel are accepted. A GM note from the same turn is not.
   Location renames are covered.
2. **Tables.** "Any table" became a bounded parsing contract, with ambiguity
   refusals and the read-and-roll fallback.
3. **Gemini** also gets `generate_name` and `resolve_random_event`.
4. **Privacy.** The drawer, unused names and hidden table rolls stay out of
   the narrator, online snapshots and party views.
5. **One admission policy** for all three event sources. Tripwires roll only
   on quiet turns, the chaos scale is numeric, and the combined rate is
   stated.
6. **Name sources** are declared per system and per starter, with a person
   or place kind. Nothing scans notes for names.
7. **Tripwire signals.** Tripwires read typed rest and session events plus a
   cautious text check. A hit takes effect next turn. They are off for all of
   session zero.
8. **The drawer** is one draw per turn, reused on rebuilds, and previews
   never roll. A private ledger of offered names replaces "never stored".
9. **Oracle use** is counted only from identified table rolls. The M2 gate
   is unchanged.
10. **Conflicting instructions** in the prompt and the schemas are removed in
    the same change. The built-in table names move to the stable prompt, and
    both tool budgets are measured on the final lists.
