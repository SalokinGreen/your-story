# Real randomness for the GM — design

Status: **design, for the author's review** (2026-10-26). Decisions 259–262.
Nothing here is built. The implementation plan is a separate document, written
after this one is approved.

## 1. The problem

The author: "the GM should use the tables a lot more for randomness because
LLM randomness isn't random enough."

What the code does today:

- **The model alone decides whether anything random happens.** The system
  prompt already says "Tables (USE THEM - DON'T JUST IMPROVISE)" and "roll it
  rather than inventing the answer" (`ai_staged.ts` 2438–2443, 2052–2054).
  Prose pressure is all there is. The one forcing check, the M2 roll gate,
  covers contested scenes only, and the GM may decline it.
- **A table note costs three calls.** The GM sees only a table's title, so it
  must `read_notes`, then `formula_roll` the die the note names, then read off
  the entry. `roll_table` rolls only the 45 built-in Mythic tables, and its
  description lists just 40 of them.
- **The engine's own randomness waits on the model.** The scene check, chaos
  drift, interrupted-scene events and the director's seeds all run only after
  the model calls `increment_scene`. A random event also comes from
  `fate_question` doubles (9% of calls).
- **The counts disagree.** A table note rolled with `formula_roll` doesn't
  count as using the oracle, either for the oracle-gap judge or for the
  "NEVER consulted" nudge. The M2 gate counts `formula_roll` but not
  `roll_table` or `roll_portent`. `GOOGLE_ESSENTIAL_TOOLS` omits `roll_table`,
  so a Gemini GM can't roll one.
- **Names are the model's own.** `generate_name` returns only pointers (a
  first letter and syllables), and the model still writes the name.

**What the eval of 2026-10-26 showed** (`research/model-eval-2026-10-26.md`):
every model tested shares two oracle misses. One is asking `fate_question`
about a plain question an NPC would simply answer (GLM 5.3 5/5, Gemma 5/5).
The other is inventing what the notes don't establish (the cellar case:
DeepSeek V4 Pro at xhigh 5/5, the Flash models 2–3 of 5).

## 2. What real play and the research say

- **Mythic** pairs a yes/no oracle with two **meaning** words (an action and a
  description) as inspiration. It also tests each new scene against the chaos
  factor, so a scene may come out altered or interrupted. Players decide what
  logically happens first and roll for the surprise.
- **Ironsworn**'s Ask the Oracle says to take the obvious answer when there
  is one ("Your first instinct is often the right one") and to roll when there
  isn't. Its Pay the Price is a table of setbacks.
- **OSR** tables check for encounters on a schedule (OD&D: 1-in-6 each
  dungeon turn) or on **tripwires**: rolling "when it makes sense, not because
  it's time to" (Murkdice, after Cairn 2e). One die can do several jobs
  (Necropraxis's overloaded encounter die).
- **LLMs are poor randomisers.**
  - Hamilton & Mimno (2026): in 20,000 generated stories, three names
    ("Elias", "Mara", "Elara") covered over half the character names.
  - Models favour "7" when asked for a random number (West & Potts 2025).
  - A 2026 preprint finds they "lack a functional internal sampler".

  So randomness has to come from the engine's dice, with the model shaping
  the result.

Sources are linked in the research agent's notes, summarised in §8.

## 3. The design

Five parts. Each is useful on its own, and they add up.

### 3.1 The dice drawer, very light (decision 259)

Before every GM turn, the engine rolls a small drawer and puts it in the
**live block**, so the cache rule holds. It is **material, not orders**. The
GM uses a drawer item only when the turn needs something new. Otherwise it
ignores the drawer, and nothing checks whether it used it.

```
DICE DRAWER (rolled by the engine; use only what this turn needs)
Names: Ilse Varga · Tomas Ruel · Mother Hesk   Meaning: protect / ruined
```

- **Contents:** three names from the setting's name tables (§3.2) and one
  meaning pair (an action word and a description word, from the built-in
  meaning tables). Nothing else, to keep the drawer light. No event, attitude
  or weather goes in the drawer: events come from the tripwires (§3.4), and
  everything else is a one-call roll (§3.3).
- **About 40 tokens a turn.** It is re-rolled every turn and never stored.
- **Off** in session zero, which has its own setup material.
- **Not seen by the narrator**, so the narrator never writes a drawer name
  into the prose by accident.

### 3.2 Names only from tables (decision 260)

A new named person or place gets a name the engine rolled.

- **Where names come from**, first match wins:
  1. the story's own name table notes;
  2. the system's name tables (Blood & Bone's People → Names d100, each
     Fantastic Realms realm's names d20, Grave Watcher's first and family
     names);
  3. a built-in fallback: original name lists in a handful of styles
     (European fantasy, modern English-speaking, and so on). These are new
     text, never copied (decision 3). The style is recorded once per story,
     from the setting step or the first `generate_name` call.
- **`generate_name`** returns full rolled names (three candidates) instead
  of pointers.
- **The engine disposes.** `add_npc`, and `campaign` writes that add a
  person or a location, refuse a new name that isn't on the story's list of
  rolled names (the drawer's, `generate_name`'s, and any table result). The
  refusal offers three freshly rolled names.
- **Exempt from the check:**
  - names the player typed;
  - names already in the story's notes, NPCs or campaign record;
  - names from the adventure's own material;
  - an alias the record already holds.
- **Names in prose:** names the GM writes only in prose, without a tool,
  can't be checked exactly. They are flagged after the turn by a free
  rung-1 check: a capitalised new name that is in no list and no record goes
  to the Debug Logs and the turn's details. It never rewrites.

### 3.3 Any table in one call (decision 259, "both")

- **`roll_table` rolls a table note too.** Given a note's title and,
  optionally, a sub-table heading, the engine reads the die from the heading
  (`(1d20)`, `(1d100)`, `(d66: …)`: the same forms `checkTableShape` already
  checks), rolls it, and returns the entry. A built-in Mythic table name
  still works as before.
- **The description gets shorter, not longer.** "A built-in table name or a
  table note's title" replaces the list of 40 names, to stay under the tool
  budgets: 9,997 of 10,000 tokens for the default list, 11,465 of 11,500 for
  Fantastic Realms. Calling an unknown name lists the valid ones.
- **The table titles show their dice in the live block** ("B&B — People
  (Names d100, Looks d20, …)"), so the GM knows what it can roll without
  reading the note.
- **The counts agree.** Every table roll, and every `formula_roll` on a
  table note the GM read this turn, counts as oracle use: for the recency
  nudge, the oracle-gap judge and the M2 gate. `roll_table` joins the Gemini
  list.

### 3.4 Tripwires for surprises (decision 261)

The engine checks for a random event when play crosses a line it can see,
not on a timer and not when the model asks:

| tripwire | how the engine sees it | chance |
|---|---|---|
| a new scene | `increment_scene` (the existing Mythic scene check) | unchanged |
| a rest, or a session's end | `take_rest`, `end_session` | 1 in 6 |
| travel or time passing | a phrase table on the player's line and the GM's prose, the turn-end check machinery (`turnEndChecks.ts`) | 1 in 6 |
| a long run with no oracle | 6 turns in a row with no oracle or table roll | 1 in 6, then the count resets |

- **What a hit does:** it adds a pending random event with a rolled focus
  and a meaning pair, exactly the event `fate_question` doubles already make.
  It shows up in the live block until the GM calls `resolve_random_event`.
- **At most one pending event at a time,** and at most one tripwire roll per
  turn.
- **Chaos scales the chance:** 1 in 6 at chaos 5, one step more likely or
  less likely per two points of chaos.
- **Every tripwire roll writes a Debug Logs line,** hit or miss.

### 3.5 The oracle step reworded

The eval's shared misses come from the roll chain's step 3. It gets one
added clause and one example pair, inside the system prompt's existing
budget:

- **Clause:** "A person in the scene who knows the answer and would say it is
  not an oracle question: narrate what they say."
- **Example pair:** "the innkeeper names the stranger" goes to narration.
  "What is behind the locked cellar door" goes to the oracle or a table.

## 4. What it does not do

- It does not decide outcomes for the GM. A drawer word or a rolled event is
  an input the GM shapes into the fiction, as Mythic intends.
- It does not force a roll on every turn. The drawer is optional, and the
  tripwires fire about one turn in six when one is crossed.
- It does not touch a story's own dice system, the judges' severities or the
  narrator.
- It does not store the drawer. Only rolled names that were *used*, plus the
  pending events, reach `StoryData`.

## 5. Risks

| risk | guard |
|---|---|
| Too much randomness ("too strong is too random") | The drawer is two lines and optional. Tripwires fire only on crossings, at 1 in 6, with one event at a time. |
| The tool list passes its budget | `roll_table`'s description gets shorter. `tests/toolBudget.test.ts` holds both lists. |
| The name check refuses a fair name (one the player said, a pun, a title) | The exemptions above. A refusal never ends the turn; it comes back with three names to pick from. |
| The cache stops hitting | The drawer lives in the live block only. The base messages stay byte-identical across a turn's rounds. |
| Old saves | Every new field is optional. A story with no name tables uses the built-in lists. |

## 6. How we will know it worked

- **The eval runner saves each run's prose,** so a failure such as "prose
  lacks the toll-keeper" can be read, not guessed at.
- **New generation cases:**
  - a new NPC appears: their name comes from the drawer or a roll;
  - a new room is entered: a table is rolled;
  - a tripwire event is pending: it is worked in and resolved;
  - a quiet turn with a full drawer: nothing from the drawer is forced in.
- **The oracle cases,** gossip and cellar, rerun against the 2026-10-26
  numbers.
- **One played session,** on the author's go: count the distinct names, and
  the tables rolled per hour.

## 7. Open questions for the implementation plan

- Which name styles the built-in fallback ships with, and how many names
  each.
- The exact travel and time-passing phrase list. This can start from the
  dawn check's machinery.

## 8. Sources

Research notes from 2026-10-26, as fetched by the research agent:

- Mythic GME 2e: the Word Mill product page (47 meaning tables).
- Ironsworn: Ask the Oracle and Pay the Price, from a rulebook copy whose
  edition is uncertain.
- OSR practice:
  - The Alexandrian, "Reactions to OD&D" (1-in-6 per turn);
  - Murkdice, "Tripwire or timer?";
  - Necropraxis, "Overloading the encounter die".
- LLM randomness:
  - Hamilton & Mimno (arXiv 2605.26492, names);
  - West & Potts (arXiv 2505.00047);
  - Zhang et al. (arXiv 2510.01171, typicality bias);
  - arXiv 2601.05414 (no internal sampler; seen as a snippet only).

Mythic's rulebook text, the official Ironsworn text and the OSE core could
not be reached directly. Where those claims rest on secondary sources, the
research notes say so.
