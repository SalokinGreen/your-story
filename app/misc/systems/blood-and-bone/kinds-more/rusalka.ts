/**
 * Blood & Bone, AI edition: the Rusalka Kind.
 * Original text for the GM, in the voice of the author's rulebook
 * (docs/blood-and-bone/rulebook.md). The folklore is shared Slavic and Baltic
 * heritage; the text is not copied from any other product (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const RUSALKA_NOTE: BuiltinNote = {
  id: "builtin:blood-and-bone:rusalka",
  title: "B&B — Rusalka",
  type: "mechanics",
  tags: ["Blood & Bone","Kind"],
  content: `# B&B — Rusalka

Stress triggers below are +1 each, once a scene each (key = the trigger's name). XP triggers pay once a session. Use the sheet's numbers; the Beast steps are already-true changes to narrate.

## The Kind
The drowned of rivers and lakes, any gender, who did not go quietly. Bound to one body of water, they sing, lure and drown, and the river takes them back whenever it wishes.

- **Stress Escalation:** Increases when they have gone a night without touching their water, when a lure fails or is refused, or when they hear their own death named aloud, or when they go a dawn without touching their water (the Weakness below; one trigger, key "dry").
- **Recover Move: Sate the Beast** – Requires drawing a life into the water. It need not be a death: a mortal's breath, a vow sworn at the shore, a willing swim.
- **Progression Triggers (XP):** 1 XP for luring someone to the water's edge unseen; 3 XP for taking a life, breath or vow into the water without a witness; 5 XP for a mortal returning to your water of their own will.
- **Your Water:** Choose it at creation: a river, a lake or a canal (the Danube, the Vltava, the Vistula). Further from it than a night's walk, the second and third abilities of your Powers do not work.
- **Weakness:** Dryness. Each dawn you have not touched your water (the river itself, or a bath drawn from it), raise Stress by 1 (key "dry"). Cracked skin, hair that dries and a cough of river water are the signs. Holding a church bell's rope, a cut willow branch or a hand-held flame, you cannot Compel anyone.

## Archetypes
**The Drowner** — *Lures and takes, and the river is kept fed.*
- Strong hit on Sate the Beast decreases Stress by 3 when the life drawn in is taken: a death.
- A miss on Sate the Beast automatically includes the Mask Slips price: someone saw, someone heard.
- **Archetype XP:** 1 XP for a death mistaken for an accident; 3 XP for drawing someone away from people who loved them; 5 XP for answering a hunter's trap with one of your own.
- **Alternate XP:** 1 XP for learning what a mortal is most afraid of; 3 XP for being left an offering; 5 XP for a river-city legend about you that you did not write.
- **Stress Relief:** a long night in deep water; the song coming back to your throat; a mortal warned off the river by a friend who does not know why.

**The Willing Tide** — *Takes breath and vows, not lives, and lets the swimmer go.*
- Sate the Beast without a death: a strong hit decreases Stress by 2 as normal, and the draw never brings a Mask Slips complication.
- A death in your water that you witness, sense nearby or cause raises your Stress by 2.
- **Archetype XP:** 1 XP for a swim shared and ended safely; 3 XP for a vow kept from both sides; 5 XP for a mortal who knows what you are and walks to the shore anyway.
- **Alternate XP:** 1 XP for returning something the river took; 3 XP for turning a drowning into a rescue; 5 XP for a bridge, quay or ferry that changes because of you.
- **Stress Relief:** a mortal singing back to you; floating with the current and nowhere to be; a dry day that ends at the water's edge without harm.

## Beast Meter track — The Undertow
1. Your hair never fully dries. A damp trail follows you through dry rooms.
2. You cannot cross water without wanting to be in it.
3. **(First Crack)** You hear your name in the sound of a tap, a gutter, a river.
4. The hum in your throat becomes a tune you did not choose.
5. Dry air hurts. You carry water the way mortals carry a phone.
6. **(Slipping)** Strangers on a bridge look down at the water, away from you.
7. You forget what breathing feels like without effort.
8. You begin to hold people under, in thought, to see how long it takes.
9. **(Last Warning)** You say your own death aloud like a prayer, smiling.
10. **(Control)** The river takes you back, and what comes up wearing your face has never known air.

## Powers
### Kind Powers

**THE LURE**
1. When you Compel a mortal within hearing of you with a song, a light or a call across water, add +1.
2. At the water's edge, add +2.
3. Once per session, call a mortal from a distance to your water: automatic strong hit on Compel. They arrive in a daze and remember only the song. Raise your Stress by 1.

**WATER-SHAPE**
1. When you Slip Away through water (a canal, a drain, a bath), add +1. You are not seen entering or leaving.
2. The add becomes +2.
3. You carry one person with you under water; they breathe and the one roll covers you both.

**THE DROWNED EYE**
1. When you Gather Information at the edge of your water, add +1; on a hit you also learn what fell in there last.
2. The add becomes +2.
3. Once per session, ask the river one question about the past of a place. The GM answers truthfully, in fragments, and you add +2 to the next roll that uses the answer.

**RIVER'S GRIP**
1. When you Face Danger in or beside water, add +1.
2. In a Skirmish by water, add +1 to your first Action Roll, and you may hold an enemy under for a round: add +1 to your next roll against them until they get out (a player held under acts at -1).
3. Once per session, drown a Troublesome or Dangerous enemy you physically hold in your water: the Skirmish ends in your favour. Against a Formidable or higher one it instead marks their progress track three times (Epic: once). Raise your Stress by 2.

**WET HAIR, WET HANDS**
1. When you Gather Information by following damp left by someone you have touched, add +1.
2. The add becomes +2 through rain, fog or river mist.
3. Raise a fog or a swell on your water for a scene: Secure an Advantage as a strong hit, no roll, hiding a street, a ferry or a crossing. Raise your Stress by 1.

**THE LONG MEMORY**
1. When you Gather Information about the history of a place on the water, add +1; on a hit you learn one fact the mortals forgot.
2. When you Secure an Advantage using that history, add +2.
3. Once per session, a weak hit on any roll about a death in your water counts as a strong hit.

### Drowner Powers

**THE HOLD**
1. When you Face Danger by dragging someone toward the water, add +1.
2. A mortal you have lured cannot Slip Away from you in sight of your water.
3. Once per session, a mortal you hold in the water simply stays: automatic strong hit, no scream. The GM decides who comes looking.

**THE CROWN OF WEEDS**
1. When you Secure an Advantage using weeds, reeds or a drowned thing's grip to hold a door, gate or pair of ankles, add +1.
2. The add becomes +2, and you can hold a crowd back from the water for a scene.
3. Call the river over its bank for a night: a strong hit on Secure an Advantage across a district. Raise your Stress by 2; the city is on alert.

### Willing Tide Powers

**THE SECOND BREATH**
1. A mortal who swims with you cannot drown in your water that night, and when you Sate the Beast on a willing swim, add +1.
2. When someone you pulled from the water Faces Defeat, a miss counts as a weak hit; for a non-player, they live and you choose the price. Raise your Stress by 1.
3. Once per session, a swim with you heals one lasting harm a mortal carries. They remember it as a dream.

**THE VOW AT THE SHORE**
1. When you Compel someone who has sworn a promise at your water's edge, add +1. Break it and the river asks.
2. The add becomes +2.
3. Hold a vow to account from anywhere on the river: a weak hit on the Compel counts as strong. Raise your Stress by 1.`,
};
