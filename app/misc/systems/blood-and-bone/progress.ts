/**
 * Blood & Bone, AI edition: B&B — Progress, vows and XP.
 * Original text for the GM, condensed from the author's rulebook
 * (docs/blood-and-bone/rulebook.md). Not copied from any other product
 * (decision 3).
 */
import type { BuiltinNote } from "../types";

export const PROGRESS_NOTE: BuiltinNote = {
  id: "builtin:blood-and-bone:progress-vows-and-xp",
  title: "B&B — Progress, vows and XP",
  type: "mechanics",
  tags: ["Blood & Bone"],
  content: `# B&B — Progress, vows and XP

Tools: manage_track create (kind, rank), mark (times), progress_roll (the engine counts filled boxes only, ties go to the dice, and reports strong hit, weak hit or miss), set_status (fulfilled, forsaken, cleared), halve, set_rank. XP is the XP meter (adjust, once_per "session", key = trigger).

## Ranks

Vows, enemies, investigations, journeys and long projects share one five-step ladder of **rank**: how much work it takes to get through.

| Rank | What It Means | Progress Per Mark |
|---|---|---|
| **Troublesome** | A night's problem. A single obstacle. | 3 boxes |
| **Dangerous** | A real arc. Several sessions. | 2 boxes |
| **Formidable** | A campaign thread. Months of play. | 1 box |
| **Extreme** | The kind of thing that defines a chronicle. | 2 ticks |
| **Epic** | Almost beyond you. Elders, ancient pacts, city-shaping forces. | 1 tick |

## Progress Tracks

A progress track is **ten boxes**, each divided into **four ticks** — forty ticks total.

When you make meaningful progress toward a ranked objective, you **mark progress**: fill in the amount listed above for that rank. Four ticks fill a box.

Mark progress when the fiction earns it: defeating a lieutenant, uncovering a crucial name, surviving a journey leg, completing a ritual step.

**Marking progress on a miss.** You never mark progress on a miss. A miss means the obstacle held.

## FULFIL YOUR VOW

When you believe you've done everything the Vow required and move to complete it, don't make an action roll. Instead:

1. Count your **filled boxes** — ticks in a partially filled box don't count.
2. That total is your **progress score**, from 0 to 10.
3. Roll the two Challenge Dice and compare, exactly as you would an Action Score.

- **Strong hit:** The Vow is fulfilled. Take XP per the table below.
- **Weak hit:** The Vow is fulfilled, but not cleanly — something you wanted is lost, or the resolution creates a new problem. Take XP as normal, minus 1 (minimum 1).
- **Miss:** The Vow is not fulfilled. Something you believed was wrong. Either abandon the Vow, or the GM reveals what remains and you continue with your progress reduced to half its current boxes, rounded down (manage_track halve).

You may attempt it at any time; at two boxes the dice will treat it accordingly.

## Forsaking a Vow

You may abandon a Vow at any point: set_status forsaken, and take **1 Stress** — it costs something to stop caring about a thing you swore to. You do not gain XP.

The people who were counting on it are still out there.

## Downtime

Between sessions each character takes **two Downtime actions**. Downtime is narrated: say what you did, resolve it, move on.

**MEND** — Mark progress on one Condition per its rank, or roll to Clear a Condition if you have progress to spend.

**LAY LOW** — Attempt Clean Up (Chapter 13) to reduce Exposure. Doing so in downtime means it costs you visibility rather than risk: you were gone, and people noticed you were gone.

**REPAIR A BOND** — Spend time with one Connection. Roll +Heart: on a strong hit, raise its rank by one. On a weak hit, it holds where it is and you learn something they've been hiding. On a miss, whatever's been wrong between you surfaces badly.

**WORK THE VOW** — Mark progress on one Vow per its rank, if the fiction supports off-screen effort. You must be able to say specifically what you did.

**FORTIFY** — Improve a Haven, prepare a Rite's materials, or set up something for what's coming. Take +1 to your first roll next session relating to that preparation.

**FEED CAREFULLY** — Sate the Beast (or Steel the Resolve) with no time pressure and no witnesses. Roll as normal, but treat a miss as a weak hit. You had the luxury of being careful.

**REACH OUT** — Contact a faction, ask a favour, or open a negotiation. The GM tells you what response is waiting at the start of next session.

### Downtime and the Reckoning

The Reckoning comes **before** downtime. Downtime cannot reduce Stress to dodge the dice.

## The XP Economy

**XP comes from three places:**

| Source | Award |
|---|---|
| **Fulfilling a Vow** | Troublesome 1 · Dangerous 2 · Formidable 3 · Extreme 4 · Epic 5 |
| **Kind Progression Triggers** (Ch. 2) | 1, 3, or 5 as listed |
| **Archetype XP / Alternate XP** (Ch. 2) | 1, 3, or 5 as listed |

**Each trigger pays once per session**, however many times you technically satisfy it. Feeding undetected four times in a night is 1 XP, not 4.

## Spending XP

| Purchase | Cost |
|---|---|
| **New asset** (Power, Path, Haven, Companion, Relic, Rite) — grants first ability | 2 XP |
| **Next ability** on an asset you already have | 3 XP |
| **Raise a stat by 1** (maximum 4) | 10 XP |
| **Raise a Connection by one rank** | 3 XP |

**Stats above 3.** A stat may reach 4 through play, never at creation, never higher.

**You cannot buy off the Beast Meter.** No amount of XP touches it. That's the point of it.

## Conditions

A Condition is a lasting problem: an injury, an impairment, a state you're stuck in. Conditions come from weak hits and misses, from Skirmish costs like *Flesh and Bone*, from Paying the Price, and from the fiction generally.

**Every Condition applies −1 to rolls it plausibly affects.** The GM and player agree on scope when it's taken — a shattered hand affects Bone and fine work, not conversation.

**You can carry three Conditions.** Taking a fourth means you're **Broken** (below).

Conditions have a **rank**, which determines how hard they are to clear:

| Condition Severity | Rank | Example |
|---|---|---|
| Minor | Troublesome | Cracked ribs, deep laceration, badly sprained |
| Serious | Dangerous | Broken limb, severe burns, concussion |
| Grave | Formidable | Destroyed hand, punctured lung, silver wound |
| Permanent | — | Cannot be cleared; becomes part of the character. Kept on the sheet, not as a track (below) |

## CLEAR A CONDITION

When you take real time and appropriate care to recover — rest in a Haven, treatment from a Companion or Path, or your Kind's natural healing — mark progress on the Condition's track per its rank. When you have progress to spend, roll to clear it exactly as you would Fulfil Your Vow.

- **Strong hit:** The Condition is cleared entirely.
- **Weak hit:** The Condition is cleared, but downgrade it to a lesser Condition rather than removing it, or it leaves a Permanent Condition (below) in place of the old one.
- **Miss:** It hasn't healed, and something has gone wrong — infection, a badly-set bone, something worse. The GM may raise its rank.

**Permanent Conditions.** Never a manage_track: a track can be cleared and these cannot. Write each on the sheet's Permanent Conditions line with its scope ("-1 to Bone and fine work"). It applies -1 to the rolls it plausibly affects, like any Condition, and takes one of the three slots for good. A Permanent Condition is never healed by Downtime, Regeneration or any Power. A purely cosmetic mark is no Condition and never counts as a miss's price.

**Supernatural healing.** Kinds and Powers that heal rapidly (Regeneration, The Old Blood) clear Troublesome and Dangerous Conditions automatically between sessions, provided the character has fed. They do not clear Grave Conditions, and they never clear silver wounds for Werewolves or sunlight damage for Vampires — those follow the mundane track.

**Hunters have no shortcut:** time, medicine and other people.

## FINISHING AN ENEMY

A Formidable-or-higher enemy's track (manage_track create, kind enemy) is marked by Decisive Victories and by plans that work. When the players have a way to bring them down for good (a trap sprung, a rite, allies, a weakness found), they make the finishing move: manage_track progress_roll. Strong hit: the enemy is ended in the way the plan set up; set_status fulfilled. Weak hit: they are ended or driven out for good, at a cost you name. Miss: it fails, they escape or escalate, and the track is halved (manage_track halve). The track need not be full to try. An Epic one can only be unmade, bargained with or outmanoeuvred, so its finishing move needs a fictional means the players have earned, not a stronger roll.

## CONNECTIONS

Strong: +1 when you call on it, or an automatic weak hit instead of rolling, once a session. Steady: reliable and ordinary; calling on it for aid, information or shelter is a normal roll, with no bonus and no risk to the bond. Weak: calling on it needs a Heart roll to see if it holds; a miss breaks it. Forge a new Connection, always at Weak, whenever the fiction earns it: an ally won, a debt repaid, a truce struck. A rank falls when you use a Connection carelessly or endanger it, and a Weak one that falls again is removed. Repair a Bond and XP raise a rank. A Connection made by the Making starts at Steady and is never Burned (Time Skip note).

## BURDENS

A Burden does not fade; it is resolved. Doomed ends when the character confronts its source in a scene you frame as the climax: win or lose, the Burden is then removed. Indebted ends when the debt is fully paid: by service the faction sets (you judge how much), by an equivalent trade, or by the faction's destruction, which carries its own consequences. No asset is needed. Many Burdens mean a Time Skip or the Successor path is coming.

## BROKEN

When you take a fourth Condition, you are **Broken**. You are not dead, but you are out of the fight and the scene, at the mercy of whoever stands over you. While Broken you can only speak. To recover, someone must get you somewhere safe and you must clear at least one Condition.

## Death

A character dies only when the player agrees, or when the fiction leaves no other reading. Otherwise reach for Broken, a Time Skip, a Burden or capture; the Successor path exists so that losing a character can be a beginning.`,
};
