/**
 * Blood & Bone, AI edition: B&B — Character creation.
 * Original text for the GM, condensed from the author's rulebook
 * (docs/blood-and-bone/rulebook.md). Not copied from any other product
 * (decision 3).
 */
import { kindsInWords } from "./kindList";
import type { BuiltinNote } from "../types";

export const CREATION_NOTE: BuiltinNote = {
  id: "builtin:blood-and-bone:character-creation",
  title: "B&B — Character creation",
  type: "mechanics",
  tags: ["Blood & Bone"],
  content: `# B&B — Character creation

Read this in session zero. Walk the table through Step Zero, then each player through Steps 1-8. For each Kind, offer B&B — Creation prompts: <Kind> to fill in the background. Finish by writing each sheet (character_sheet note, titled "Character: <name>" in a party), then manage_meter create_set "Blood & Bone character" (plus "Witch" or "Wendigo" if the Kind needs it) and manage_track create the Vow (kind vow, rank as chosen) for each. Start Stress 2, Beast 0, Exposure 0, XP 0 (Stress 1 if they took a Burden and that benefit).

# Step Zero
Before anyone builds a character, the table answers one question together: **why are these creatures in the same room?**

A Vampire, a Hunter, and a Ghost have no natural reason to cooperate, and "we all met at a bar" collapses the first time someone's hunger becomes inconvenient. Your **Cohort** is the answer — the thing that holds the group together when the fiction is pulling it apart.

Choose one, or build your own:

**THE TRUCE** — *You are not friends. You are a solution to a shared problem.*
Something in this city threatens all of you regardless of Kind. You cooperate because the alternative is worse.
- **Shared asset:** One Haven, held in common, that nobody fully controls.
- **Pressure:** The moment the shared threat is gone, so is the reason.

**THE CELL** — *Someone organized you, and you said yes.*
A faction, an elder, or a Vigil handler assembles and directs you. You have resources and orders.
- **Shared asset:** One Companion — your handler or contact — available to all.
- **Pressure:** You don't choose your jobs, and you don't get told everything.

**THE FOUND FAMILY** — *You are what each other has left.*
Whatever you are, you've each lost everything else. This is the last thing standing.
- **Shared asset:** Each member holds a Connection to every other member at Steady rank.
- **Pressure:** You'd all cross a line for each other, and eventually one of you will ask.

**THE CREW** — *You do work. The work pays.*
Smuggling, cleanup, retrieval, protection — you sell a service to a market with no other suppliers.
- **Shared asset:** One Haven functioning as a base of operations, plus a reputation.
- **Pressure:** Your reputation is your income, and it's fragile.

**THE DEBT** — *You all owe the same thing to the same party.*
Whatever it was, it was significant, and it hasn't been paid.
- **Shared asset:** Everyone takes **Indebted** to the same holder, and each takes one benefit from the Step 6 menu.
- **Pressure:** Your creditor decides what you do next, and they know exactly where you all live.

**THE INVESTIGATION** — *You each found a piece of the same thing.*
Separately, you all pulled a thread. The threads led to the same place, and now you can't unsee it.
- **Shared asset:** One Relic, Archive, or body of evidence held collectively.
- **Pressure:** What you're uncovering is protected by people who protect things well.

### Cohort Rules

- **Everyone shares a Vow.** In addition to your personal Vow, the Cohort holds one shared Vow at Formidable rank or higher, tracked on a single progress track. All members mark it, and all members earn XP when it's fulfilled.
- **The shared asset is genuinely shared.** Any member may use it. Any member losing it loses it for everyone. It cannot be sold, hidden, or claimed by one character.
- **Cohorts break.** If the premise stops being true in the fiction, say so at the table and choose a new one, or let the group fracture. A Cohort collapsing is a good arc, not a failure.

# The steps
Pick one Kind: ${kindsInWords()}. This decides your Stress Escalation triggers, your Recover Move, your Progression Triggers, and your Weakness (see the Kind's note).

Then pick one of that Kind's Archetypes (two in the Kind's note; each of the seven original Kinds has a third in B&B — <Kind>: The <Archetype>, which also adds two Kind Powers). Your Archetype doesn't change what you are — it changes how you carry it, bending your Sate the Beast outcomes, your Stress triggers, or both. Everything else you build branches off these two choices.

### Step 2 — Assign Your Stats

Distribute these five values across your stats: **3, 2, 2, 1, 1**. Every stat must get one of these numbers, none repeated except the two 2s and two 1s.

- **Nerve** — quickness, guns, getting out of the way, keeping your head.
- **Heart** — resolve, compassion, reaching people, your hold on your humanity.
- **Bone** — strength, taking punishment, violence up close.
- **Shadow** — moving unseen, lying well, hunting from the dark.
- **Wits** — what you know, what you notice, thinking faster than the other side.

Put your highest stat where your character's Kind naturally excels — but you don't have to. A Vampire with high Heart and low Shadow is a compelling, unusual character precisely because it fights the type.

**The first-session swap.** After you've actually played the character once, you may move a single point between two stats — no explanation required. Character sheets always look different once they've hit a table, and one session of play tells you more about what you built than an hour of planning did.

### Step 3 — Set Starting Stress

All characters begin play at **Stress 2** and **Beast 0**, regardless of Kind. You're not starting in crisis, but you're not stable either — the hunger (or doubt, for Hunters) is already present, and the long slide hasn't begun.

### Step 4 — Choose Your Vow

Every character begins with a **Vow**: a driving goal that gives your character a reason to act rather than just react. A Vow can be as personal as protecting a specific person, or as large as unraveling a citywide conspiracy. Rate your Vow's difficulty:

- **Troublesome** — achievable in a session or two.
- **Dangerous** — a real arc, several sessions long.
- **Formidable** — a campaign-spanning goal.
- **Extreme** — the kind of Vow that could end the character's story, one way or another.

Your Vow isn't fixed forever — it can be fulfilled, abandoned, or replaced as the story moves, but you always have one active. Ranks, progress tracks, and Fulfil Your Vow are in B&B — Progress, vows and XP.

### Step 5 — Establish Starting Connections

Choose **two Connections** to start play with. For each, decide:

- Who or what they are (a person, a faction, a place).
- Their starting rank: one **Steady** and one **Weak**, or two **Weak** — your choice.
- One sentence describing why this bond still matters to your character, despite what they are now.

These are the people and things your character hasn't let go of yet. Play will test every one of them.

### Step 6 — Take on a Starting Burden (Optional)

Most characters begin play burden-free. If you want a character with more baggage from the start — someone already deep into their story rather than at its beginning — you may choose to start with one Burden (Doomed or Indebted).

**You may take at most one Burden at creation.** In exchange, choose exactly one of the following:

- Raise one starting Connection by one rank (Weak → Steady, or Steady → Strong)
- Take a second ability on any one of your starting assets
- Take one additional Connection at Weak rank
- Begin play at Stress 1 instead of 2

Tell the GM what the Burden is and who holds it. A starting Burden should point at something the campaign can actually use — a faction in the city, a rival with a name, a debt with terms. "Something is coming for me eventually" is not a Burden; it's a mood.

### Step 7 — Choose a Power, a Path, Gear, and Resources

Choose one **Power** from your Kind's note (B&B — <Kind>) and take its first ability, free.

Choose one **Path** (B&B — Paths) and take its first ability, free. Your Path is what you were before this — everyone has a before, and it still shapes what you're good at.

Then list 2–3 pieces of gear, resources, or assets that fit your Kind and background: a car, a weapon, a safehouse key, a grimoire, a badge, a phone full of contacts. These aren't tracked with detailed inventory rules — they exist to justify adds and fictional positioning when the moment calls for them ("I do have lockpicks for exactly this").

### Step 8 — Name and Background

Give your character a name, and answer these three questions to ground them before play begins:

1. **What were you before?** (Or, for Ghosts: what were you in life?)
2. **What was the moment you knew you weren't human anymore?**
3. **Who knows what you really are — and how are they handling it?**`,
};
