/**
 * Blood & Bone, AI edition: the Doppelgänger Kind.
 * Original text for the GM, in the voice of the author's rulebook
 * (docs/blood-and-bone/rulebook.md). Not copied from any other product
 * (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const DOPPELGANGER_NOTE: BuiltinNote = {
  id: "builtin:blood-and-bone:doppelganger",
  title: "B&B — Doppelgänger",
  type: "mechanics",
  tags: ["Blood & Bone","Kind"],
  content: `# B&B — Doppelgänger

Stress triggers below are +1 each, once a scene each (key = the trigger's name). XP triggers pay once a session. Use the sheet's numbers; the Beast steps are already-true changes to narrate.

## The Kind
A thing that wears stolen faces and lives stolen lives. It has no shape of its own it can remember, and the longer it wears one face, the less of it is left underneath.

- **Stress Escalation:** Increases when someone who knows the worn face grows suspicious, when it is called by a name that was never its own, or when it goes a night with no face worn at all.
- **Recover Move: Sate the Beast** – Requires living a stolen life for a night: being someone, fully, among the people who love them, and being loved back.
- **Progression Triggers (XP):** 1 XP for a night as someone else that no one questions; 3 XP for stepping into a life its owner cannot take back; 5 XP for leaving a stolen life undiscovered, with everyone better off.
- **Weakness:** The face holds only while you hold it. When your Stress is 4 or higher and a trigger raises it, or when you Face Defeat, the worn face runs: features blur, the voice wavers, and everyone watching gets one wrong moment. The person whose face you wear, meeting you, breaks the disguise outright, and so do two people comparing what they saw.

## Archetypes
**The Understudy** — *Takes one life and learns it down to the habits, afraid to lose it.*
- Sate the Beast within your one chosen life: a weak hit decreases Stress by 2 instead of 1.
- Wearing a second face while you hold the first raises your Stress by 1 and ends that bonus until the next night.
- **Archetype XP:** 1 XP for passing a test only the real person would have passed; 3 XP for protecting the life you wear from a threat meant for the original; 5 XP for being loved by someone who then learns the truth, and staying.
- **Alternate XP:** 1 XP for learning a habit nobody told you; 3 XP for keeping a promise the original made; 5 XP for the original, found, choosing to let you stay.
- **Stress Relief:** a family meal in a home you were given; being corrected on a detail and getting it right the second time; a quiet hour in the real person's chair.

**The Cuckoo** — *Moves from life to life, taking what each one gives and leaving ruin behind.*
- Strong hit on Sate the Beast decreases Stress by 3 when the life you wore is left worse off than you found it.
- A miss on Sate the Beast automatically includes the Mask Slips price, no choice involved.
- **Archetype XP:** 1 XP for stepping into a life within a night of choosing it; 3 XP for leaving a life behind without a trace; 5 XP for a life you took becoming a refuge for the next.
- **Alternate XP:** 1 XP for stealing a face from someone who was careless with it; 3 XP for becoming someone's last hope; 5 XP for being thanked, by name, under a name that is not yours.
- **Stress Relief:** a clean break from a life that was closing in; being given a name by someone new; watching a stolen life carry on without you.

## Beast Meter track — The Blank
1. You catch yourself rehearsing a stranger's laugh in an empty room.
2. You stop dreaming in your own voice. The dreams have borrowed ones.
3. **(First Crack)** You cannot say what you look like when no one is watching.
4. Mirrors show you the last face you wore, a moment late.
5. You answer to the wrong name before you notice.
6. **(Slipping)** Your own memories file themselves under other people's names.
7. You begin to love the people the faces loved, and cannot say whose idea it was.
8. Waking, you check for the face first, and sometimes cannot find one.
9. **(Last Warning)** You can no longer picture where you began.
10. **(Control)** Nothing under the face is left to take it off. It goes on living, in someone else's name.

## Powers
### Kind Powers

**THE BORROWED FACE**
1. When you take the face and build of someone you have studied and Compel or Slip Away in it, add +1. A stranger sees nothing wrong.
2. The add becomes +2, and people who know the original see the difference only on a miss.
3. Once per scene, a weak hit on a roll made to pass for someone who knows the original counts as a strong hit. Holding the face this way raises your Stress by 1 each scene.

**STOLEN VOICE**
1. When you Compel in a voice you have heard for a full minute, add +1.
2. When the listener trusts that voice, add +2.
3. Once per session, throw a voice across a room so that someone seems to speak who is silent: Secure an Advantage as an automatic strong hit, no roll. Raise your Stress by 1.

**THE STUDY**
1. When you Gather Information about a person you are copying, add +1; on a hit you also learn a habit or phrase they never say aloud.
2. After a night spent watching someone, add +2 to any roll to pass for them.
3. When you Gather Information by touch, a weak hit counts as strong, and you see a fragment of their latest memory. Raise your Stress by 1.

**NO ONE IN PARTICULAR**
1. When you Slip Away in a crowd, add +1. Witnesses recall no detail of you.
2. The add becomes +2.
3. Once per session, a weak hit on Slip Away counts as a strong hit, and guards and clerks wave you through. Raise your Stress by 1.

**THE QUICK CHANGE**
1. When you Face Danger by changing faces mid-scene, add +1.
2. When you Slip Away by changing faces, add +2.
3. Once per session, change a second time to shake a pursuer: automatic strong hit on Slip Away. Raise your Stress by 1.

**SHED SKIN**
1. When you Face Defeat, add +1, and you may rise as someone else. Nobody connects the two.
2. The add becomes +2.
3. Once per session, drop a face for good and decrease your Stress by 2. The GM decides who that face was hurting.

### Understudy Powers

**LIVED-IN**
1. Add +1 to any roll made in the life you wear, among the people who know it.
2. When someone close to the original grows suspicious and you Compel or Face Danger to settle it, add +2.
3. Once per session, a miss on a roll in that life counts as a weak hit: a favour, an alibi, a held door. The GM says whose it was.

**THE HEIR APPARENT**
1. When you Gather Information about a person's ties and how much they would be missed, add +1; on a hit you learn who would notice first.
2. When you Secure an Advantage using the original's name, money or ties, add +2.
3. If the original is gone, you inherit their name, money and ties outright: automatic strong hit on Secure an Advantage. The GM names the price.

### Cuckoo Powers

**THE EMPTIED ROOM**
1. When you Slip Away from a life you have worn, add +1. The people there remember you less each day.
2. The add becomes +2.
3. Once per session, take a life that was open to you (a flat, a name, a job) as a strong hit on Secure an Advantage. Raise your Stress by 1.

**THE FALSE TRAIL**
1. When you Slip Away and leave a worn face where it will be found, add +1.
2. The add becomes +2, and pursuers who find the face lose your trail.
3. Set a stolen face to take the blame for something: a weak hit on Compel or Secure an Advantage counts as strong. Raise your Stress by 1 and make an enemy of the original.`,
};
