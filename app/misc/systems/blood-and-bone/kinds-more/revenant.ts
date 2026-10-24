/**
 * Blood & Bone, AI edition: the Revenant Kind (decision 160).
 * Original text for the GM. Not copied from any other product (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const REVENANT_NOTE: BuiltinNote = {
  id: "builtin:blood-and-bone:revenant",
  title: "B&B — Revenant",
  type: "mechanics",
  tags: ["Blood & Bone", "Kind"],
  content: `# B&B — Revenant

Stress triggers below are +1 each, once a scene each (key = the trigger's name). XP triggers pay once a session. Use the sheet's numbers; the Beast steps are already-true changes to narrate.

## The Kind
The dead who climbed back into their own body for one purpose: vengeance, a promise, a debt. The body is a tool the purpose wears. When the purpose is dropped, the body notices.

- **Stress Escalation:** Increases when a dawn passes with no step taken toward the purpose (key "idle dawn"), when someone from the life they lost recognises them, or when the target prospers unpunished.
- **Recover Move: Sate the Beast** – Requires advancing the purpose: a step taken against the target, a promise kept, a debt paid in full or in part. Rolled Shadow if covert, Bone if by force. Doing something else, however useful, does not count.
- **Progression Triggers (XP):** 1 XP for a step toward the purpose that costs you something real; 3 XP for turning the purpose's obstacle into a means; 5 XP for fulfilling the purpose.
- **When the purpose is done:** Fulfil Your Vow on the purpose ends the pull. The body stops. The player chooses: rest (the character ends with a last scene the player narrates), or refuse and name a new purpose, take Doomed, and begin again at Stress 4. A Revenant with no purpose has no recovery and no way to Sate the Beast.
- **Weakness:** The body is a corpse and is not repaired by anything supernatural. It heals only as fast as the purpose lets it. While Stress is 4 or higher the decay shows (smell, skin, a hand that will not close): -1 to Compel and to any roll that depends on being taken for living, with anyone close. Fire and long immersion in running water are hard on it; each is a Condition on a miss, not a Stress trigger.

## Archetypes
**The Avenger** — *The purpose is a person, or a few people, and what was done to you.*
- Sate the Beast on a step taken against the target in person: strong hit decreases Stress by 3 instead of 2.
- Helping a third party never satisfies the purpose. "The target nearby and unpunished" is an additional Stress Escalation trigger.
- **Archetype XP:** 1 XP for learning something true about the target that they thought buried; 3 XP for taking something from the target that they will feel for years; 5 XP for facing the target and choosing, with full power to end them, how it ends.
- **Alternate XP:** 1 XP for refusing a cheaper revenge; 3 XP for an ally who knows what you are and helps anyway; 5 XP for protecting an innocent who stood between you and the target.
- **Stress Relief:** the target seeing you and understanding; a piece of the target's world falling away; a quiet night in a place the target will never find.

**The Oathkeeper** — *The purpose is a promise to someone, or a debt to the dead.*
- A strong hit on Sate the Beast by keeping faith with the person you promised, or the memory of them, also means the next idle dawn after that one does not raise Stress; this ends at the dawn after.
- +1 to any Heart roll made to keep the promise at personal cost.
- **Archetype XP:** 1 XP for a small kindness to the one you promised; 3 XP for keeping the promise when keeping it was the harder thing; 5 XP for passing the promise on to someone who can carry it.
- **Alternate XP:** 1 XP for hearing out someone who says the promise should be broken; 3 XP for finding what the one you promised would actually have wanted; 5 XP for being released from it by the one you promised.
- **Stress Relief:** a hand on something that belonged to them; telling someone who has a right to know what they were like; finishing a task for them that no one else remembered.

## Beast Meter track — The Rot
1. You stop feeling pain. You keep your hands in view when you remember to.
2. The cold of the grave stays in your joints, even in a warm room.
3. **(First Crack)** The purpose is the only thing you can talk about, and people notice that you steer.
4. Your reflection comes back older than you remember.
5. Birds, dogs and children go quiet in the street you walk down.
6. **(Slipping)** Whatever the purpose does not touch begins to fall away: meals, friends, your own name on paper.
7. You say the target's name when you mean to say your own.
8. Someone who loved you in life sees you and finds nothing left of the person.
9. **(Last Warning)** The purpose has grown past what it was: now it needs a target, and any will do.
10. **(Control)** You are finished before the purpose is. What walks on is only the errand.

## Powers
### Kind Powers

**UNQUIET BODY**
1. Pain, cold and exhaustion do not slow you. Add +1 to Face Danger by simply enduring.
2. When you Face Defeat from physical harm, add +2.
3. Once per session, ignore the effects of a wound or Condition for one scene, and act as if it were not there. Raise your Stress by 1.

**THE PURPOSE'S PULL**
1. You always know the direction of the target (a person, a place, a thing owed). When you Undertake a Journey toward them, add +1.
2. When you Gather Information to find the target or follow a trail toward them, add +2.
3. You know when the target is in mortal danger or has just escaped it. When you Secure an Advantage against the target, add +1.

**DEAD MAN'S PATIENCE**
1. You do not sleep, tire or need to be fed. When you Face Danger by outlasting something (cold, hunger, a long stakeout), add +1.
2. When you Secure an Advantage by waiting and watching, add +2.
3. Once per session, begin a scene exactly where you chose to be, unnoticed, and add +1 to your first action roll there.

**THE FACE AT THE FUNERAL**
1. People who knew you in life believe the dead can walk less than they believe their own eyes. When you Compel someone who loved you, add +1.
2. Mortals who see you do not look long. Add +1 to Slip Away from a crowd.
3. You can leave the mark of the grave on a person you touch: a chill, a smell, an unease that will not lift. Until dawn, add +1 to Compel them and to Slip Away from them, and they cannot Slip Away from you in sight. Doing so raises your Stress by 1.

**GRAVE STRENGTH**
1. Mundane barriers (doors, bars, a lock) need no roll from you. When you break free of a restraint or a hold, add +1.
2. When you Face Danger or Secure an Advantage with raw strength, add +1.
3. Once per fight in a Skirmish, you may reroll only your action die (the core's Reading abilities give the procedure: formula_roll ["1d6"], keep both challenge dice, recompute the score with calculate, before any consequence or record). Doing so raises your Stress by 1.

**THE LAST WORD**
1. When you Gather Information about someone's account of the dead, add +1, and on a hit you know what they are hiding.
2. When you Compel someone who carries guilt, add +1.
3. Once per session, say a truth about the target aloud. The GM tells you whether it holds, and your next Compel against them counts a weak hit as a strong hit.

### Avenger Powers

**THE LIST**
1. Name a target of the purpose. Add +1 to all rolls against them.
2. Anyone who helped the target with what was done to you is also on the list. Add +1 against them when they know why you came.
3. Once per session, the target cannot Slip Away from you in a scene: the GM decides where they run, and what it costs them to be caught.

**A DEBT COLLECTED**
1. When you take something from the target, you gain a fragment of what they were (a name, a key, a habit; the GM decides which) and add +1 to your next roll that uses it.
2. Take something from the target in public and walk away: the Mask Slips does not apply. They know it was you.
3. Once per session, turn a miss against the target into a weak hit. Raise your Stress by 1.

### Oathkeeper Powers

**THE PROMISE HELD**
1. When you act to keep the promise, add +1 to the roll.
2. Add +2 to Aid Another when the one you promised is the person you are helping.
3. Once per session, you may call on the promise to carry you through a Defeat: you rise, hurt, with a hard-won step toward keeping it.

**A DEBT TO THE DEAD**
1. When you Gather Information at the resting place of someone wronged, add +1, and on a hit you learn how they died.
2. When you Gather Information about someone who died unjustly, add +2.
3. Once per session, a ghost, a grave or a living witness speaks for you: one Compel or Gather Information roll counts as a strong hit. The GM names what they want in return.`,
};
