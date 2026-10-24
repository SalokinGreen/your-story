/**
 * Blood & Bone expansion E3 (decisions 150-159): the Wendigo's third Archetype, The Shepherd. Original text (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const WENDIGO_SHEPHERD_NOTE: BuiltinNote = {
  id: "builtin:blood-and-bone:wendigo-shepherd",
  title: "B&B — Wendigo: The Shepherd",
  type: "mechanics",
  tags: ["Blood & Bone", "Kind"],
  content: `# B&B — Wendigo: The Shepherd

The third Archetype of the Wendigo, beside the two in B&B — Wendigo. Everything in that note still applies.

## Archetype
**The Shepherd** — *Keeps a flock: people who depend on you, fed, housed and led, and takes from them slowly.*
- Your flock is a Connection (a group, Steady to start): a shelter, a congregation, a household, a crew. Sate the Beast by culling one of your flock: on a strong hit, decrease Stress by 3 and the Slipping Mask goes to 0 as usual. On a weak hit the flock notices someone missing: Exposure +1.
- When the flock suspects a cull, the Connection drops a rank. At Weak it is removed, and a Weak flock turns on you.
- +1 to Compel and to Secure an Advantage with members of your flock.
- Harm to your flock, or a member leaving it, is an additional Stress Escalation trigger.
- **Archetype XP:** 1 XP for taking in someone who needed you and was not yet missed; 3 XP for the flock hiding you from someone who came looking; 5 XP for a flock that grows to feed you through a winter without a single cull.
- **Alternate XP:** 1 XP for keeping a flock member alive through something you could have let take them; 3 XP for turning a member's loyalty into a favour from outside; 5 XP for a flock member learning what you are and staying.
- **Stress Relief:** a full table of people who are warm and fed because of you; a member thanking you, meaning it; leading a hard night to its end with no one lost.

## Shepherd Powers

**THE GOOD SHEPHERD**
1. You can take in a stray, someone with nowhere else to go, without a roll. They join the flock, and when you Face Danger or Slip Away to protect them, add +1.
2. When you Compel a member of your flock, add +2.
3. Once per session, the flock closes around you: a household or crowd hides you from pursuit and lies for you. Slip Away is an automatic strong hit where your flock lives. The flock Connection drops a rank.

**THE PORTION**
1. Once a night, take a small piece from a sleeping flock member. Roll Sate the Beast with Shadow; any hit sets the Slipping Mask to 0, but a strong hit decreases Stress by only 1. They wake unwell and remember nothing.
2. A member taken from this way sickens slowly. When you Face Danger to keep the sickness from being traced to you, add +1. If you keep it up, the flock notices within a few sessions; the GM says when.
3. Once per session, take a portion from the whole flock at once: decrease Stress by 2, no roll. The flock Connection drops a rank and Exposure +1.

## More Kind Powers
Any Wendigo may take these.

**THE LEAN WINTER**
1. The first foodless dawn after a feed does not advance the Slipping Mask.
2. The Starving trigger fires one dawn later than it normally would at your Beast level.
3. Once per session, ignore one foodless dawn entirely. The next dawn counts double: the Slipping Mask rises by twice your normal foodless-dawn increase (to the meter's cap).

**THE KIND STRANGER**
1. Mortals who are cold, lost or alone are drawn to trust you. When you Compel one, add +1.
2. When you offer warmth or shelter and then Gather Information, add +2.
3. Once per session, a stranger you have sheltered vouches for you to others, at once and to anyone, and you add +1 to Compel or Gather Information with anyone they vouch to that scene. They become a Weak Connection and are in danger because of it.`,
};
