# Fantastic Realms, grown — design

**Status:** design, for the author's review. Not approved for building.
Decisions 243–253 (`docs/decisions.md`). The base system is
[`fantastic-realms-design.md`](fantastic-realms-design.md) (decisions
201–219); everything here builds on it and changes none of its rules unless a
section says so. The implementation plan comes after approval.

The author: "We need to grow the Endless Realms rules a lot more." All eight
areas were chosen (decision 243), as a full rules book (decision 244), drafted
here for the author's approval (decision 245).

## 1. What stays, what grows

**The base stays exactly as it is:**
- the pool;
- successes against a DC;
- the tiers;
- burning;
- hearts and down;
- foes as stat lines;
- rests by realm;
- initiative and damage;
- XP and levels.

**The pinned core** (`FR — Core rules`) stays under 3,000 tokens. It grows by
a short index line per new area ("Magic: read FR — Magic before the first
spell") and the two rules the GM applies on every roll: conditions taking a
die, and helping. Everything else is a note read on demand, as in Blood &
Bone.

All text is original (decision 3).

## 2. Magic (decision 246)

**A spell is a feat:** *Fireball*, *Mind Control*, *Speak with the Dead*,
*Warding Circle*.
- It adds a die like any feat, when it fits. The GM reads it generously but
  honestly.
- A hero may hold several spell feats.
- A spell feat reaches only as far as its words. *Mind Control* does not
  throw fire.

**What it can do.** A spell does what a skilled mundane action could not:
- touch a mind;
- call fire;
- mend a wound;
- see far.

The DC follows the deed, not the spell. Calming a frightened horse is DC 2;
turning a dragon's will is DC 6.

**The cost is the miss.** A magic miss is a **miscast**. The GM picks or rolls
one from the realm's miscast table:
- **it backfires:** one heart, or a condition;
- **it goes wide:** it hits the wrong thing;
- **it draws attention:** something notices;
- **it leaves a mark:** a condition such as *Hollow-Eyed*, until a rest;
- **it costs the spell:** the feat is burned without its sure success.

A weak hit on a spell works, at a cost the GM picks; a small miscast may be
that cost.

**Burning a spell feat** is the grand, flashy version: one sure success, as
for any feat. After a burned spell, the next miss with that spell before the
rest is a double miscast.

**Each realm's magic:**

| Realm | Magic | Its miscasts lean towards |
|---|---|---|
| Aurelane | Bright, courtly, sanctioned | Attention and glory gone wrong |
| Larkenfell | Folk-magic and bargains | The hedge-folk taking their price |
| Gloamreach | Rare and costly | Marks and hollowness |

Each realm note gains a "Magic here" section and a d12 miscast table.

**Learning magic.** A spell feat is gained like any feat:
- at creation, when the concept supports it;
- at a level, from what happened.

There is no spell list. *FR — Magic* gives about forty example spell feats
across the realms, as inspiration and never as a closed list.

## 3. Gear and treasure (decision 248)

**A good item is a feat you carry:** *Grandmother's Lantern*,
*Dwarf-Forged Axe*, *Cloak of Thistledown*.
- It adds a die when it fits, like any feat.
- It is marked as an item on the hero's feat list.
- Plain gear (rope, torches, a meal) is fiction, with no dice.

**An item can be lost, broken or stolen.** That is a cost the GM can pick on
a miss or a weak hit, instead of a heart.
- A lost or stolen item leaves the feat list. Getting it back is a story.
- A broken one stays on the list, marked broken, and cannot be named in a
  roll until it is mended at a rest with the right help.

**Quality words.** An item feat may carry one quality word in parentheses:
*Sword (Keen)*. The quality is part of the feat. It gives an effect, not
another die.

| Quality | Effect |
|---|---|
| Keen | A strong hit with it does +1 damage. |
| Sturdy | A single miss cannot break it. |
| Warded | It turns aside one condition a scene. |
| Swift | It also counts as an edge feat for initiative. |
| Bright | It reveals one hidden thing per scene. |
| Cursed | It adds a die, but on a miss it takes its price as well as the GM's cost. |

*FR — Gear* lists twelve qualities.

**Treasure** comes in three kinds:
- **coin:** story only, spent on plain gear and favours;
- **items:** new item feats;
- **wonders:** an item feat with two qualities, or a one-use marvel.

Its XP stays as decision 213 set it, roughly its worth. Each realm gains a d20
treasure table, and the existing treasure table grows.

**Buying.** A town sells plain gear and, rarely, an item feat; the GM names
the price in the fiction. *FR — Gear* has a short price guide, not a list.

## 4. Conditions and harm (decision 247)

**A condition is a word on a hero:** *Wounded*, *Afraid*, *Poisoned*,
*Cursed*, *Exhausted*, *Bleeding*, *Lost*, *Frozen*.

**It costs a die** from any roll it gets in the way of, never below 1. The GM
says which conditions hinder a roll, as it says which feats help; the engine
takes the die away.

**When the GM gives one:**
- instead of a heart, on a miss;
- as the cost of a weak hit;
- alongside a heart, when a harm word applies.

Harm stays capped as decision 216 set it: a miss costs at most two, hearts
and conditions together.

**Most conditions clear at a rest.** Some need a cure, which the condition's
entry in *FR — Conditions* names:
- *Poisoned* needs an antidote or a healer;
- *Cursed* needs the curse broken.

**Too many.** A hero with three conditions at once is down, as at 0 hearts.

**Scars.** A hero who goes down may take a scar instead of the GM's cost.
- A scar is a lasting word that costs a die only in its own situation
  (*Fear of Fire*).
- Scars never clear on their own.
- At a level, a hero may turn a scar into a feat ("Fireproof"), which
  replaces it.

## 5. Callings (decision 249)

**A calling is an optional path.** It gives:
- a one-line identity;
- a **starting kit** of five suggested feats to pick from;
- one **signature feat** only that calling starts with;
- a list of eight **path feats** to choose from at levels;
- one **calling move:** a once-per-rest flourish, in words.

**A hero may ignore callings and stay freeform.** Taking a path feat outside
your calling needs the GM's nod and a reason in the story.

**The twelve callings** of *FR — Callings*:
- Knight;
- Witch;
- Rogue;
- Bard;
- Ranger;
- Priest;
- Tinker;
- Sellsword;
- Scholar;
- Hedge-Walker;
- Duelist;
- Wanderer.

**Local callings.** Each realm adds two:
- **Aurelane:** the Herald, the Dragon-Sworn;
- **Larkenfell:** the Reeve, the Barrow-Warden;
- **Gloamreach:** the Lamplighter, the Penitent.

**Example: the Knight.**
- **Signature feat:** *Oath-Bound*.
- **Kit:** *Sword*, *Armor*, *Brave*, *Horse*, *Commanding Voice*.
- **Path feats:** *Shield Wall*, *Challenge the Champion*,
  *Unhorsing Strike*, *Banner-Bearer*, *Iron Will*, *Merciful*,
  *Last to Fall*, *Lord's Favour*.
- **Calling move:** *Rally*. Once per rest, every ally in the scene clears
  *Afraid*.

## 6. Travel and the realms

**A journey is a challenge.** Travelling somewhere that takes days is run as
a `tally` challenge (`start_challenge`).
- **Rounds:** its length in days, capped at 5.
- **Each round:** one roll for the day's hardest part (the weather, the road,
  getting lost), against the route's DC.
- **A miss** costs supplies, a condition (*Exhausted*, *Lost*) or an
  encounter.
- **A strong hit** finds something.
- **The result** decides how the party arrives.

**Encounters.** Each realm gains an "On the road" d20.

**Supplies** is a party meter, 0–6. A journey day with no strong hit costs 1.
At 0 the party is *Hungry*: a condition on every hero, cleared by a meal and a
rest.

**The Thin Mile** is where one realm's rules give way to the next. It is a
scene, not a roll. The crossing note says what changes: the rest rule, the
magic and its miscasts, the local callings. A hero keeps everything they
carry, though a condition from one realm may mean something else in the next.

**More realms.** Three new realm notes, in the base pack's shape, each with
its own rest rule and magic:
- **Thornmere,** a drowned kingdom of fen-cities. Rest: a dry night under a
  roof.
- **Emberhold,** a volcanic realm of forge-halls. Rest: a day at a forge-hall's
  hearth.
- **The Hollow Sky,** cloud-islands. Rest: one turn of the sky-wheel, about
  six hours.

Each gets:
- a "Running it" paragraph;
- its people, places and troubles;
- a foe roster;
- miscasts;
- treasure;
- road tables.

## 7. Bestiary

*FR — Bestiary* holds the general rules, and each realm note a roster. A foe
stays a stat line (DC, words, hearts, XP), with two additions:
- **Tactics.** One line on what it does on its turn: decision 217's threat,
  written down.
- **Phases, for legends.** A legend has 2–3 phases, each with its own words
  and threat. A new phase starts when its hearts drop past a mark (6 → 3, for
  example), and its next threat is worse.

**The rosters:**
- 12 foes per original realm (8 exist, so +4 each);
- 12 per new realm;
- six legends in all, one per realm, each with phases and a lair, in
  *FR — Legends*.

**The words.** *FR — Bestiary* lists the twenty most-used foe words and what
each does, in four kinds:
- **harm words** (*Deadly*, *Fire-Breath*, *Venomous*): a miss against it
  costs two;
- **edge words** (*Fast*, *Ambusher*): +1 initiative;
- **guard words** (*Armored*, *Swarm*): already counted in the DC;
- **strange words** (*Undying*, *Shapeshifter*): beating it needs a specific
  feat or item.

## 8. Downtime and the hearth

**Downtime** is what heroes do between adventures, in a stretch longer than a
rest (a season, a month). Each hero picks one activity. Each is a single roll
at DC 3 unless the GM says otherwise.

| Activity | A hit gives | A miss gives |
|---|---|---|
| Train | Sharpen a feat's wording (decision 209), or swap a kit feat for another of the calling's | Nothing |
| Craft | An item feat; a quality on a strong hit | Spoiled materials |
| Mend | Clear a lasting condition or a cure-needing one, or mend a broken item | Not yet |
| Seek | A rumour, a lead, a contact (a new NPC) | A rumour that is false |
| Tend the hearth | A hearth improvement | Nothing |

**The hearth** is an optional home base the party shares: a farmhouse, a
tower, a ship.
- **Improvements:** up to five, each a word that helps one kind of roll at the
  hearth, or once per adventure away from it: *Library*, *Stables*, *Shrine*,
  *Workshop*, *Watchtower*.
- **Its record:** a note, with the improvements listed on it.
- **Who lives there:** townsfolk at the hearth are NPCs with a want.

## 9. Group play

**Helping.** An ally whose feat fits can add one die to another hero's roll.
- The ally names the feat.
- At most one helper per roll.
- The helper shares the outcome: on a miss, the GM may give the cost to the
  helper instead of, or as well as, the roller.
- A helper's feat cannot be burned for someone else's roll.

**A team burn.** Twice per rest, per party, two heroes may each burn a feat on
the same roll: two sure successes, and both feats burned.

**Initiative for many.** `initiative_roll` already takes every hero. Foes'
numbers are stated once per fight.

**The spotlight.** When a hero has had no roll or scene in their name for
three turns, the GM turns to them next.

## 10. The engine

What the rules above need from code; the rest is notes. Every new field sits
on an existing tool, so no tool is added.

**Conditions.**
- **The record:** each hero gains
  `conditions: { word, needsCure?: string, scar?: boolean }[]`.
- **Writing them:** `manage_feats` gains the actions `add_condition`,
  `clear_condition` and `add_scar`.
- **On a roll:** `feat_roll` gains `hindered_by: string[]`, matched against the
  hero's conditions and scars. It takes one die per entry, never below 1. A
  word the hero doesn't have is refused, as an unowned feat is.
- **Down:** a hero with three conditions (scars not counted) is reported as
  down.
- **Rest:** `take_rest` clears conditions with no `needsCure`.

**Items.**
- A feat gains `kind: "skill" | "spell" | "item"` and `broken?: boolean`.
- `feat_roll` refuses a broken item until it is mended
  (`manage_feats action: "mend"`).
- A quality is part of the item's wording ("Sword (Keen)"). The GM reads its
  effect, as it reads damage today.

**Magic.** `feat_roll` reports `magic: true` when any named feat is a spell.
On a miss its result says "Miscast: read or roll the realm's miscast table".
It writes nothing more; the table is a note.

**Helping.** `feat_roll` gains `help: { hero, feat }`.
- The helper's feat must be owned, unburned and not broken.
- It adds one die, and the dice are reported per hero.
- The result names the helper, so the GM knows whom a miss can cost.

**A team burn.** `feat_roll` gains `team_burn: { hero, feat }`: a second sure
success.
- Counted per party per rest in the system state (`teamBurnsUsed`).
- Refused past two; reset by `take_rest`.

**Supplies.** A meter set `"Fantastic Realms party"` (Supplies 0–6), made once
per party with `manage_meter`.

**Nothing new for the hearth or for phases:** the hearth is a note, and the GM
reads phases from the stat line.

**What the GM and the player see.**
- The live block's hero line shows conditions and scars beside the feats:
  "Bryn — feats: Brave, Sword (Keen), Shield (broken); conditions: Wounded".
- The Meters panel shows conditions as chips in the danger token, and broken
  items struck through.

**The budgets.**
- The tool-budget test measures the grown schemas. The whole default list
  stays under 10,000 tokens. Fantastic Realms tools are offered only to its
  stories, but they still count against that budget.
- The core note stays under 3,000 tokens, held by its test.

## 11. The notes

| Note | Holds |
|---|---|
| `FR — Magic` | Rules, the miscast kinds, about 40 example spell feats |
| `FR — Gear` | Items as feats, 12 qualities, buying, mending |
| `FR — Conditions` | The rules, about 16 conditions with their cures, scars |
| `FR — Callings` | The rules and the twelve callings |
| `FR — Bestiary` | Foe rules, the twenty words, phases |
| `FR — Legends` | The six legends, with phases and lairs |
| `FR — Travel` | Journeys, supplies, the Thin Mile |
| `FR — Downtime` | Activities, the hearth |
| `FR — Group play` | Helping, team burns, the spotlight |

Each realm note, the three old and the three new, gains:
- magic here, and a d12 miscast table;
- its two local callings;
- foes to twelve;
- a treasure d20;
- an "On the road" d20.

## 12. Slices (for the implementation plan)

1. **The engine:**
   - conditions;
   - item kinds and broken items;
   - spell reporting;
   - helping and team burns;
   - the party meter set;
   - the live line and the chips;
   - tests for all of it.
2. **The rules notes:**
   - the nine notes of §11;
   - the core's index lines and its two every-roll rules;
   - their token budgets, tested.
3. **The three original realms grown:** magic, callings, foes, treasure, road.
4. **The three new realms and the six legends.**
5. **The starter:**
   - Wolfwillow Crossing's presets get callings;
   - its plan gets a journey and a legend;
   - a browser check and an APK.

Slices 2–5 are prose the author reads in the PR.

## 13. The open points, decided (2026-10-25)

- **Three conditions put a hero down,** scars not counted (§4; decision 250).
- **Team burns: twice per rest, per party** (§9; decision 251).
- **The new realms are Thornmere, Emberhold and the Hollow Sky,** as drafted
  (§6; decision 252).
- **A path feat outside one's calling needs the GM's nod** and a reason in the
  story (§5; decision 253).
