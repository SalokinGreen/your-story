/**
 * Blood & Bone expansion E3 (decisions 150-159): the Hunter's third
 * Archetype, the Penitent, with its Powers and two new Kind Powers. Original
 * text (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const HUNTER_PENITENT_NOTE: BuiltinNote = {
  id: "builtin:blood-and-bone:hunter-penitent",
  title: "B&B — Hunter: The Penitent",
  type: "mechanics",
  tags: ["Blood & Bone", "Kind"],
  content: `# B&B — Hunter: The Penitent

The third Archetype of the Hunter, beside the two in B&B — Hunter. Everything in that note still applies.

## Archetype
**The Penitent** — *Hunts to atone: for a death you could have stopped, a monster you served, a thing you did and cannot undo.*
- Steel the Resolve by penance (a vigil at a grave, a debt paid to the family of someone you failed, a hardship you choose to bear; the GM names what it costs): roll +Heart. On a strong hit, decrease Stress by 3 instead of 2. On a weak hit, decrease Stress by 1 and the old wound that resurfaces is always the thing you are atoning for.
- Penance never works twice in a night, and it fails outright if you could have prevented harm to a mortal and chose not to.
- +1 when you Face Danger or Compel to protect someone from the same kind of harm you once caused.
- **Archetype XP:** 1 XP for paying a debt to someone you wronged without being asked; 3 XP for stopping a harm you once took part in from happening to someone else; 5 XP for refusing a way out of your guilt that would have cost an innocent.
- **Alternate XP:** 1 XP for telling a stranger the truth about what you did; 3 XP for being forgiven by someone who had the right not to; 5 XP for being refused forgiveness and continuing anyway.
- **Stress Relief:** carrying out a small act of amends nobody will ever know about; a night of honest work for someone who needs it; a confession heard in silence.

## Penitent Powers

**THE WORK OF AMENDS**
1. When you act to protect or repay someone you once failed or harmed, add +1.
2. When you Compel by confessing what you have done, roll +Heart and add +2.
3. Once per session, take the whole consequence of a weak hit or miss that would fall on someone else in the scene. Raise your Stress by 1.

**THE SCARRED WITNESS**
1. You know the look of guilt from the inside. When you Gather Information about someone hiding a wrong they did, add +1.
2. You can tell whether a person in front of you is carrying a killing. The GM answers truthfully.
3. When a monster, a faction or another hunter demands a price from someone under your protection, you may stand in as the price. Once per session. Raise your Stress by 2 and take Indebted.

## More Kind Powers
Any Hunter may take these.

**THE PATTERN**
1. When you Gather Information from records, morgues or police files, add +1.
2. When you Gather Information about a run of killings or disappearances, add +2.
3. Once per session, the GM tells you where the next incident in a pattern you have uncovered will happen, or has just happened. Stress +1: you see it the way the killer does.

**THE CIVILIAN COVER**
1. You hold a plausible job, papers and an alibi that survive a casual check.
2. When you Compel officials or Slip Away from authorities using your cover, add +2.
3. Once per session, make a lethal scene read as an accident or an ordinary crime: Clean Up with an automatic strong hit. Raise your Stress by 1.

## Running the Penitent
- Ask at creation what they are atoning for, and who still carries it. That is the sin every weak-hit wound, every Scarred Witness reading and every Work of Amends bonus points at.
- Penance must cost something a person would feel: money, a night's sleep, a place at a table. If the GM cannot name the cost, it is not penance, and the roll is a plain Steel the Resolve.
- The Penitent hunts the way they atone, not the way they are best at. Offer a hunt that would be easy if they let one innocent pay for it.
- The Erosion hits harder here: at 5 and above, penance starts to feel like routine. Narrate the hollowness, not a rule change.`,
};
