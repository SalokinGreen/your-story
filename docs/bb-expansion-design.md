# Blood & Bone, expanded — design, roadmap and the first plan

Status: **draft, waiting for the author's approval.** Decisions 150–157.
Builds on [`default-systems-design.md`](default-systems-design.md)
(decisions 62–89), which made Blood & Bone the first built-in system.

## 1. What the author asked for

"Okay next we need to expand blood and bones by a lot." The interview:

| # | call |
|---|---|
| 150 | All four areas: setting and world, oracles and tables, starter adventures, character options |
| 151 | Claude writes it, the author reviews; original text only (decision 3) |
| 152 | Triple or more: a full expansion book, many PRs over several sessions |
| 153 | Oracles and tables land first |
| 154 | Deeper Europe before any new region |
| 155 | Both a third Archetype per Kind (and more Powers, Paths, assets) and two or three new Kinds |
| 156 | Older stories get new built-in notes when they open; their own notes are never touched |
| 157 | A sample of each kind of material first, then themed PRs, each with a reading copy |

## 2. Where Blood & Bone stands

Measured on 2026-10-24 (cl100k tokens):

- **38 notes, about 42,800 tokens.** The *Rules* pack: the core (2,100,
  carried every round), 16 mechanics notes (26,500, read on demand), 14
  tables (11,600). *Europe by Night*: 7 lore notes (2,500): an overview and
  London, Paris, Prague, Rome, Berlin, Vienna. One starter, *The Hollow Hour*.
- **7 Kinds, 2 Archetypes each.** Vampire, Gargoyle, Wendigo, Werewolf,
  Witch/Warlock, Hunter, Ghost.
- **3 oracles** (complication, scene, what they want), each a d10, plus the
  miss tables and the creation prompts.

Tripling means about **85,000–90,000 new tokens** (roughly 65,000 words) on
top of that.

## 3. What growing three times bigger breaks, and the fixes

The code map turned up five things that strain or break at 3×. They are
fixed in the first PR, before the content arrives, so every later PR is
content only.

**3.1 The title lists grow every turn.** The GM's live block lists every
mechanics, table and lore note by title, about 8 tokens a line, with no cap
and no folding (`ai_staged.ts`, `categorizeNotes`). At 3× that is about
1,000 tokens a turn, on every turn of every story, for lists the GM mostly
skims. Two fixes, together:
- **Family notes, not one note per table.** A table note holds a family of
  related tables (§4.2), so 40 new tables are about 12 notes, not 40.
- **A compact list for built-in packs.** Notes from a built-in pack are
  listed on one line per category, titles joined by commas, with the shared
  "B&B — " prefix said once: `Blood & Bone tables (read_notes "B&B — <name>"):
  Oracles: complication, Oracles: scene, People, The night, …`. About half
  the tokens of one line each. Notes the story wrote itself keep their own
  lines. This is the live block, so the cache rule is untouched.

**3.2 Older stories never see new notes.** A story copies the pack's notes
when it starts. Decision 156: **on load**, a Blood & Bone story (by
`resolveSystem`) gains the built-in *Rules* notes it doesn't hold yet.
- Never touches a note it holds (matched by `libraryNoteId`), edited or not.
- **A deleted note stays deleted.** `systemState.builtinNotesOffered`
  records every built-in id the story has been given; only ids not in it are
  added. An old save without the list starts with the ids it holds, so
  everything new arrives once.
- Setting notes (cities) are not pushed: a London story does not need
  Kraków in its list. The overview and the new cross-Europe notes (factions,
  the Hollow Roads) are, because every Europe story uses them; the cities
  stay in the library to import.
- A one-line Debug Logs entry says what was added.

**3.3 The starters copy everything.** `buildHollowHour` copies every note of
both packs into the story. From now on a starter takes the *Rules* pack, the
Europe overview and cross-Europe notes, and **its own cities** only.

**3.4 Labels and hard-coded lists.** The creation-prompt tables are listed
under "TABLES — roll the die", which is wrong for them; they get their own
label ("Character creation prompts"). The Kind list is hard-coded in three
places (`sheet.ts`, `creation.ts`, `core.ts`); new Kinds (E5) move it to one
`KINDS` constant they all read.

**3.5 The tests that hold the pack.** `systems.bloodAndBone.test.ts` pins
exact counts (3 oracles, 7 Kinds, 2 packs, 1 starter). Those become "at
least" or derived counts, and new checks take their place (§4.4).

## 4. How the material is written

### 4.1 The voice and the rules

- **Original text in Blood & Bone's voice**: second person to the GM,
  present tense, concrete, short sentences, dread over gore. The rulebook is
  the reference for tone and rules; nothing is copied from any other product
  (decision 3), including other games' tables.
- **Real places, invented night-world.** Real cities, districts and
  landmarks; invented factions, NPCs and secret histories. No real living
  person and no real organisation (a church, a police force, a company) is
  named as part of the supernatural world; they can be the mortal backdrop.
- **Grounded in real play first** (CLAUDE.md, "Real play is the base"):
  structures from how tables actually use oracles (§4.2); fiction only for
  the ceiling.
- **Every note says when to use it**: a closing "Use when…" line, like the
  existing oracles. The GM reads that line to pick a table.

### 4.2 How the tables are built

From the research (sources in §8):

- **Flat tables, not chains.** One roll gives a usable answer. Nested "roll
  on table B" chains are reported as slow and less varied than they look.
  "Roll twice and combine" stays as one entry, as now.
- **Big enough not to repeat.** The rule of thumb from the research: for N
  uses in a campaign, about 2N entries. An AI GM rolls a lot more than a
  person does, so: **d100** for tables rolled every session (names, a
  stranger's look, the night's mood), **d66** (36 entries) for tables rolled
  most sessions, **d20** for occasional ones. The existing d10 oracles grow
  to d20 or d66 when their family is written.
- **Pairs that combine.** The two-word prompt pair (an action and a subject)
  is the most-used structure in this kind of play. Each family that answers
  "what is happening" gets a pair, worded for the night-world, never copied.
- **Questions over answers where the GM should decide.** Some entries are a
  prompt ("Who told them?"), so the result opens a scene rather than
  closing it.
- **Keyed to the setting.** Many tables have a column or sub-table per Kind,
  per faction or per city (a Vampire's feeding ground is not a Werewolf's).
- **No dice inside the text the engine must parse.** A family note names its
  die per sub-table in plain words ("**Names — Central Europe** (d100)"); the
  GM rolls with `formula_roll`, as for every table note today.

### 4.3 Sizes

- Every note stays under the 2,500-token mechanics budget already enforced
  for the pack, so one `read_notes` never costs more than that.
- A family note holds 3–6 sub-tables.

### 4.4 Checks every content PR passes

- **Token budgets**: every note under 2,500, the core still under 3,000.
- **Ids**: unique, `builtin:blood-and-bone:` prefixed, never renamed once
  shipped (a renamed id switches the system tools off in old copies,
  `resolveSystem`).
- **Shape**: every table names its die, has as many entries as the die has
  faces (d66: 36, keyed 11–66), and ends with a "Use when" line.
- **References**: every Kind, faction, city or note a table names exists in
  the packs (a test lists the names and checks them).
- **No copied text**: the author reads the reading copy; no external table
  is pasted in.

## 5. The roadmap

Rough sizes in tokens. Each step is one PR (E2 and E3 may split in two), and
each is playable on its own.

| step | what | size | needs |
|---|---|---|---|
| **E0** | **Samples**: one table family, one city, one Archetype, as an artifact for the author's yes on voice and depth (decision 157). No code. | ~3k | — |
| **E1** | **Oracles and tables**, plus the engine fixes of §3.1–3.3 and 3.5 | ~22k | E0 approved |
| **E2** | **Europe, deeper**: about 10 new cities, the countryside and borderlands, the Hollow Roads as places, cross-Europe factions, a roster of named NPCs | ~25k | E1 |
| **E3** | **Character options**: a third Archetype for each of the seven Kinds; more Powers, Paths, Havens, Companions, Relics, Rites | ~18k | E0 |
| **E4** | **New Kinds**: two or three, each with Archetypes, Powers, Stress triggers, a Beast, creation prompts, meter sets as needed; the `KINDS` constant (§3.4) | ~12k | E3 |
| **E5** | **Starters**: three or four new ones in different cities and tones, built on everything above | ~12k | E1–E4 |

Total about **90,000 tokens**, a little over three times the current
42,800. The order after E1 can change; E5 is last because a starter leans
on everything else.

## 6. E0 — the samples

Before writing tens of thousands of words in one voice, the author approves
the voice. Three samples, in one artifact:

1. **A table family**: "B&B — People", with Names (d100, mixed European
   origins), A stranger's look (d66), What they're hiding (d20), and per-Kind
   tells (a d6 for each Kind) — the GM's most-rolled family.
2. **A city**: Budapest, in the shape of the existing city notes but deeper:
   atmosphere, who holds it, two factions, a local threat, three places, five
   named NPCs, hooks.
3. **An Archetype**: a third Archetype for the Vampire, in the shape of the
   existing two.

The author answers with "approved", or what to change. Nothing ships from E0
until E1, and the samples become part of E1–E3.

## 7. E1 — the plan

Branch `claude/bb-expansion`, one PR, two slices. `engine-review` on slice 1.

### Slice 1 — The engine (no content)

- `app/misc/ai_staged.ts` (`categorizeNotes` and the list rendering in
  `buildLiveBlock`): built-in notes (a `libraryNoteId` starting `builtin:`)
  listed compactly per category, prefix said once (§3.1); creation-prompt
  tables under their own label (§3.4). Story-made notes unchanged.
- `app/misc/systems/`: a pure `missingBuiltinNotes(story, system)` returning
  the *Rules* notes and the cross-Europe setting notes not yet offered;
  `StoryData.systemState.builtinNotesOffered?: string[]` in `structs.ts`.
- The story load path (`ensureStoryDataArrays` or the page's load, whichever
  already runs `stripRemovedFields`): add the missing notes with
  `libraryNoteId` set, record them as offered, log one Debug Logs line. Never
  on a story with no Blood & Bone notes. The Designer's drafts are not
  touched.
- `hollowHour.ts`: copy the *Rules* pack, the Europe overview and London
  only (§3.3). A pack note gets a `scope` tag in code (`"cross-europe"` or a
  city) so the starter and the on-load rule can choose.
- `tests/systems.bloodAndBone.test.ts`: exact counts become derived or
  "at least"; the §4.4 shape, id, budget and reference checks added.
- **Tests**: the compact list (tokens before and after, for the starter
  story), on-load adding (adds once, never overwrites an edited note, never
  re-adds a deleted one, old save without the list), the starter's notes.

### Slice 2 — The tables

About 12 family notes, each with 3–6 sub-tables, in a new
`app/misc/systems/blood-and-bone/oracles/` folder (one file per family,
exported into `RULES_NOTES`):

| family | sub-tables |
|---|---|
| People | names by region (d100), a stranger's look (d66), manner, what they're hiding, per-Kind tells |
| The night | the city's mood tonight, weather and light, what's moving after dark, sounds and smells |
| Places | a place in the city (d66), what's wrong with it, who's already there, a way in |
| The Concord and the factions | a faction's move this week, what the Concord demands, a broken rule, a price |
| The Vigil and hunters | a hunter cell (who, how they found out, what they want), their next move, their mistake |
| The Masquerade | a breach, who saw, how it spreads, how to bury it |
| Rumours | rumour (d66), true, half-true or false, who's spreading it |
| Feeding and hunger | a feeding ground per Kind, what goes wrong, who notices |
| Hooks | action + subject pair (d66 each), a job someone offers, a debt called in |
| Objects and relics | an odd object (d66), its history, who wants it |
| Investigation | a clue, where it points, what it costs to follow |
| The Hollow Roads | a stretch of road, who controls it, what travels it tonight |

The three existing oracles keep their ids and grow from d10 to d20.
Reading copy: an artifact of every new table for the author, as decision 157
says.

**Not in E1**: cities, Archetypes, Kinds, starters (E2–E5).

## 8. Sources for §4.2

The research for this design (2026-10-24) found little hard data on which
tables players actually use; the structural guidance is from designers and
solo players, single voices, and is used as a starting point, not a proof:

- Repetition and table size, the "2N entries" rule: Blog of Holding,
  <https://www.blogofholding.com/?p=7647>.
- Flat tables over nested chains: Cats Have No Lord, "Collapse your tables",
  <https://catshavenolord.bearblog.dev/collapse-your-tables/>.
- Generic versus specific oracles: Kate Plays,
  <https://kateplays.substack.com/p/solo-play-with-a-generic-oracle>.
- d66 tables: Skeleton Code Machine,
  <https://www.skeletoncodemachine.com/p/d66-tables>.
- Oracles as inspiration, the paired-prompt structure: Tomkin Press
  (Ironsworn), <https://tomkinpress.com/pages/ironsworn>.

No study of an AI GM using random tables was found. That a rolled result
is a prompt to interpret, not a verdict, is a design choice here.

## 9. Risks

- **Volume.** 65,000 words is a lot to review. Decision 157's sample-first
  step is how the voice is settled once instead of per PR.
- **Sameness.** One writer, one voice, many tables. The reference checks
  catch broken names, not dull ones; the reading copies are where the author
  catches those.
- **Cost per turn.** Mitigated by §3.1. The live block still grows a little
  with each family note, about 5 tokens each in the compact list.
- **On-load adding** changes old saves. It only adds, records what it added
  and never re-adds a deleted note.
