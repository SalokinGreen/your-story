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

Everything difficult in Blood & Bone has a **rank**. Vows, enemies, investigations, journeys, and long projects all use the same five-step ladder, and rank means the same thing everywhere: how much work it takes to get through.

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

You mark progress when the fiction earns it — not on a schedule. Defeating a lieutenant, uncovering a crucial name, surviving a journey leg, completing a ritual step. The GM decides when progress is earned; the rank decides how much.

**Marking progress on a miss.** You never mark progress on a miss. A miss means the obstacle held.

## FULFIL YOUR VOW

When you believe you've done everything the Vow required and move to complete it, don't make an action roll. Instead:

1. Count your **filled boxes** — ticks in a partially filled box don't count.
2. That total is your **progress score**, from 0 to 10.
3. Roll the two Challenge Dice and compare, exactly as you would an Action Score.

- **Strong hit:** The Vow is fulfilled. Take XP per the table below.
- **Weak hit:** The Vow is fulfilled, but not cleanly — something you wanted is lost, or the resolution creates a new problem. Take XP as normal, minus 1 (minimum 1).
- **Miss:** The Vow is not fulfilled. Something you believed was wrong. Either abandon the Vow, or the GM reveals what remains and you continue with your progress reduced to half its current boxes, rounded down (manage_track halve).

You may attempt to Fulfil Your Vow at any time. Attempting it at two boxes is a legitimate, desperate choice, and the dice will treat it accordingly.

## Forsaking a Vow

You may abandon a Vow at any point: set_status forsaken, and take **1 Stress** — it costs something to stop caring about a thing you swore to. You do not gain XP.

A Vow forsaken is often more interesting than one fulfilled. The people who were counting on it are still out there.

## Downtime

Not every gap between sessions is a Time Skip. Most of them are just a quiet week where nothing is hunting you.

Between sessions, each character may take **two Downtime actions** from the list below. Downtime is narrated, not played out — say what you did, resolve it, move on.

**MEND** — Mark progress on one Condition per its rank, or roll to Clear a Condition if you have progress to spend.

**LAY LOW** — Attempt Clean Up (Chapter 13) to reduce Exposure. Doing so in downtime means it costs you visibility rather than risk: you were gone, and people noticed you were gone.

**REPAIR A BOND** — Spend time with one Connection. Roll +Heart: on a strong hit, raise its rank by one. On a weak hit, it holds where it is and you learn something they've been hiding. On a miss, whatever's been wrong between you surfaces badly.

**WORK THE VOW** — Mark progress on one Vow per its rank, if the fiction supports off-screen effort. You must be able to say specifically what you did.

**FORTIFY** — Improve a Haven, prepare a Rite's materials, or set up something for what's coming. Take +1 to your first roll next session relating to that preparation.

**FEED CAREFULLY** — Sate the Beast (or Steel the Resolve) with no time pressure and no witnesses. Roll as normal, but treat a miss as a weak hit. You had the luxury of being careful.

**REACH OUT** — Contact a faction, ask a favour, or open a negotiation. The GM tells you what response is waiting at the start of next session.

### Downtime and the Reckoning

The Reckoning happens at the end of the session, **before** downtime. You cannot use downtime to reduce Stress and dodge the dice — the tax is collected on the night you finished, not the week that followed.

This is deliberate. Downtime is for repairing what the session cost you. It is not a way out of what the session did to you.

## The XP Economy

**XP comes from three places:**

| Source | Award |
|---|---|
| **Fulfilling a Vow** | Troublesome 1 · Dangerous 2 · Formidable 3 · Extreme 4 · Epic 5 |
| **Kind Progression Triggers** (Ch. 2) | 1, 3, or 5 as listed |
| **Archetype XP / Alternate XP** (Ch. 2) | 1, 3, or 5 as listed |

**Expected yield:** 3-6 XP per character per session.

**Each trigger pays once per session**, however many times you technically satisfy it. Feeding undetected four times in a night is 1 XP, not 4.

## Spending XP

| Purchase | Cost |
|---|---|
| **New asset** (Power, Path, Haven, Companion, Relic, Rite) — grants first ability | 2 XP |
| **Next ability** on an asset you already have | 3 XP |
| **Raise a stat by 1** (maximum 4) | 10 XP |
| **Raise a Connection by one rank** | 3 XP |

**Stats above 3.** A stat may be raised to 4 through play, but never at creation, and never higher. A 4 in any stat marks a character as genuinely exceptional — most creatures in the setting, including most elders, sit at 3.

**You cannot buy off the Beast Meter.** No amount of XP touches it. That's the point of it.

## No Hit Points

Blood & Bone doesn't track wounds numerically. A Skirmish is three rolls and an outcome, not an exchange of damage. What lasts after a fight isn't a number — it's a **Condition**.

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
| Permanent | — | Cannot be cleared; becomes part of the character |

## CLEAR A CONDITION

When you take real time and appropriate care to recover — rest in a Haven, treatment from a Companion or Path, or your Kind's natural healing — mark progress on the Condition's track per its rank. When you have progress to spend, roll to clear it exactly as you would Fulfil Your Vow.

- **Strong hit:** The Condition is cleared entirely.
- **Weak hit:** The Condition is cleared, but downgrade it to a lesser Condition rather than removing it, or it leaves a permanent mark that is cosmetic only.
- **Miss:** It hasn't healed, and something has gone wrong — infection, a badly-set bone, something worse. The GM may raise its rank.

**Supernatural healing.** Kinds and Powers that heal rapidly (Regeneration, The Old Blood) clear Troublesome and Dangerous Conditions automatically between sessions, provided the character has fed. They do not clear Grave Conditions, and they never clear silver wounds for Werewolves or sunlight damage for Vampires — those follow the mundane track.

**Hunters have no shortcut.** They clear Conditions through time, medicine, and other people, exactly as the Hunter Weakness in Chapter 2 says.

## BROKEN

When you take a fourth Condition, you are **Broken**. You are not dead — death is rare in this game and usually a choice — but you are out of the fight, out of the scene, and at the mercy of whoever is standing over you.

While Broken, you cannot take any action but speaking. To recover, someone must get you somewhere safe, and you must clear at least one Condition. Waking up Broken somewhere you don't recognize is one of the most common ways a chronicle turns.

## Death

A character dies only when the player agrees, or when the fiction leaves absolutely no other reading. If a character would die and the player isn't ready, the GM should reach for Broken, a Time Skip, a Burden, or capture instead. This game has better endings than death available — the Successor path exists precisely so that losing a character can be a beginning.`,
};
