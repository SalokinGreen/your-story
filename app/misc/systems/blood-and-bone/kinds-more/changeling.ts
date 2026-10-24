/**
 * Blood & Bone, AI edition: the Changeling Kind (decision 160).
 * Original text for the GM, drawn on shared folklore. Not copied from any
 * other product (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const CHANGELING_NOTE: BuiltinNote = {
  id: "builtin:blood-and-bone:changeling",
  title: "B&B — Changeling",
  type: "mechanics",
  tags: ["Blood & Bone", "Kind"],
  content: `# B&B — Changeling

Stress triggers below are +1 each, once a scene each (key = the trigger's name). XP triggers pay once a session. Use the sheet's numbers; the Beast steps are already-true changes to narrate.

## The Kind
Fae-touched: a child swapped in the cradle, or someone who came back from the hill wrong. They walk among mortals with a borrowed glamour, bound by bargains and by their word.

- **Stress Escalation:** Increases when they touch cold iron, when a bargain they owe is unkept at dawn (key "owed at dawn"), or when pressed to break their given word.
- **Recover Move: Sate the Beast** – Requires a bargain kept (a mortal strikes a bargain with you and you fulfil your side) or a mortal's joy taken (glamour: you draw a real, fresh happiness out of a mortal, who feels its absence afterward). Rolled Shadow if covert, Bone if by force (a bargain kept is Heart).
- **Progression Triggers (XP):** 1 XP for a bargain kept to the letter that costs you; 3 XP for striking a bargain whose terms are fair to the mortal and still serve you; 5 XP for turning a bargain against the one who made it, without breaking your word.
- **Weakness:** Iron, and the given word. Cold iron wounds you where mundane steel does not: supernatural recovery does not close an iron wound, and the scar is permanent. A bargain you speak aloud binds you: if you try to break it (or a promise you made in the open), roll Heart as Face Danger. On a miss, Stress +1, a Burden (Indebted) to whoever holds the bargain, and your glamour flickers for the scene.

## Archetypes
**The Swapped** — *Taken in a cradle and raised among mortals; the human life is real, and so is the debt.*
- Your glamour is a habit rather than a mask: the Mask Slips never costs you Exposure while you are among people who have known you for years.
- A mortal's joy taken from someone who loves you (a friend, a family member) raises your Stress by 1 afterward: it was theirs to give.
- **Archetype XP:** 1 XP for keeping a mortal friend through a night that tested them; 3 XP for keeping a bargain that protected a mortal you love; 5 XP for choosing the mortal life over a summons from the hill.
- **Alternate XP:** 1 XP for hiding a bargain from the one it concerns; 3 XP for a kindness that costs you a bargain's profit; 5 XP for someone learning what you are and staying.
- **Stress Relief:** a family meal with no bargain at the table; a small gift that asks for nothing back; being called by your mortal name by someone who means it.

**The Hill-Returned** — *Went into the hill, came back wrong, and still owes what was promised there.*
- Iron troubles you more: touching it is a +2 Stress trigger, not +1.
- Sate the Beast by keeping a bargain for the Court that took you: strong hit decreases Stress by 3 instead of 2.
- **Archetype XP:** 1 XP for keeping a bargain whose terms you do not fully understand; 3 XP for learning what the hill actually wants of you; 5 XP for outbargaining one of the Courts.
- **Alternate XP:** 1 XP for refusing a gift offered without terms; 3 XP for a debt unpaid by one of the Courts; 5 XP for returning something taken from a mortal who has been looking for it.
- **Stress Relief:** a promise to the hill met on time and in full; walking a boundary (a hedge, a stream, a crossroads) at the right hour; being addressed by your old name in the old tongue.

## Beast Meter track — The Hill
1. Iron feels wrong against your skin, and you cannot say how.
2. Mirrors give your face back a moment late.
3. **(First Crack)** You cannot say a flat lie any more. What comes out is true, but slanted.
4. Mortals' names slip. You use what they are called to you.
5. Salt and milk begin to taste like something else.
6. **(Slipping)** The glamour stops hiding and starts being you: your eyes, your hands, your voice are not quite right in daylight.
7. You dream in a language you never learned, and wake with the words still in your mouth.
8. You hear the hill's music in other people's laughter, and want to follow it.
9. **(Last Warning)** You keep a bargain by instinct, not choice. You have made three you did not mean to.
10. **(Control)** The hill calls you home, and the one who answers is not the one who left.

## Powers
### Kind Powers

**GLAMOUR**
1. When you Compel or Slip Away with a borrowed face or an illusion over you, add +1.
2. Your glamour holds against close scrutiny: a mortal who looks hard still needs a roll to see through it, and when you Slip Away from someone who has just seen through it, add +1.
3. You can wear another person's face and voice for a night. Add +2 to Compel as them. Doing so raises your Stress by 1.

**THE FAIR BARGAIN**
1. When you Compel by offering a genuine trade, add +1.
2. Your bargains hold on both sides. When you Gather Information about a bargain's terms or its parties, add +2.
3. Once per session, a bargain you spoke aloud turns a weak hit into a strong hit for you. Raise your Stress by 1; the GM sets the price the other party pays later, and it binds you too.

**THE THIN PLACES**
1. When you Undertake a Journey by hedge, stream or crossroads, add +1.
2. In a threshold place (a doorway, a stile, a graveyard gate), add +1 to Slip Away.
3. Once per session, step through a threshold and come out somewhere else in the same city, with a +1 Advantage on your first roll there. Raise your Stress by 1.

**FAE SIGHT**
1. When you Gather Information about glamour, illusion or a hidden thing, add +1.
2. You see through a lesser glamour at a glance. On a hit you also know what it is hiding.
3. You can see a Kind's Weakness in how it behaves: on a hit identifying a Kind, add +1 to your next roll against it.

**WILD LUCK**
1. Once per scene, when you Face Danger by trusting to chance, add +1.
2. Mundane bad luck passes you by: when you are the target of a misfortune that no one aimed at you, ignore it.
3. Once per session, turn a miss into a weak hit. The luck is owed; the GM names what it costs later.

**THE SWAPPED TONGUE**
1. Mortals and animals understand you. When you Compel a child, an animal or a drunk, add +1.
2. You can mimic any voice you have heard. Add +1 to Compel by voice alone.
3. You can speak a short phrase that only one listener hears as meant for them. Once per session, that person's next roll against you is at -1.

### Swapped Powers

**THE MORTAL LIFE**
1. When you act to protect the mortal life you have built, add +1.
2. Mortals who know you from before treat you as one of their own. Add +2 to Compel them while your glamour is up.
3. Once per session, the life you have built shields you from a consequence of the Mask Slips, as if it had never happened. Raise your Stress by 1.

**CRADLE-BOND**
1. When you Aid Another for a mortal you love, add +1 to the aid.
2. A mortal you love always tells you the truth about how they are. When you Gather Information on them or their circle, add +2.
3. Once per session, take a mortal's burden on yourself: decrease their Stress by 2 and raise your own by 1.

### Hill-Returned Powers

**THE COURT'S MARK**
1. When you act in the name of the Court that took you, add +1.
2. A fae creature of that Court will not strike you first. Add +1 to Compel it.
3. Once per session, call on the Court for a favour. A strong hit on any one roll; the GM names what it takes back.

**IRON-WARDED**
1. When you resist an iron wound or restraint (Face Danger), add +2.
2. Ignore the first iron wound you take each session.
3. You may carry a nail of cold iron against your skin for a scene, ignoring the iron triggers for it. Raise your Stress by 1 when you set it down.`,
};
