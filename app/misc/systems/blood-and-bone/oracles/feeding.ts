/**
 * Blood & Bone expansion E1 (decisions 150-159): the Feeding and hunger table
 * family. Original text (decision 3).
 */
import type { BuiltinNote } from "../../types";

export const FEEDING_NOTE: BuiltinNote = {
  id: "builtin:blood-and-bone:oracles-feeding",
  title: "B&B — Feeding and hunger",
  type: "table",
  tags: ["Blood & Bone", "Oracle"],
  content: `# B&B — Feeding and hunger

Three tables for the nights a character has to Sate the Beast. Roll the
feeding ground when they go looking, what goes wrong when the move misses
or the night is already tight, and who notices when the Mask is at risk.

## A feeding ground (1d6, on the Kind's list)
What "feeding" means follows the Kind's Recover Move: blood, flesh, dominion, a hunt, a sacrifice, a tether.

### Vampire
1. A night shelter where the volunteers are tired and the lights are low.
2. A club's back stairs, where nobody remembers who left with whom.
3. A night-shift hospital corridor, a patient who won't last till morning.
4. A bridge at closing time and someone who came to be alone.
5. A friend's flat, a friend who offered, and what that is now going to cost.
6. A butcher's cold room and a delivery that hasn't been counted yet. Animal blood: enough to stand, not enough to stop.

### Gargoyle
1. A rooftop where a man thinks he is unobserved. He saw too much; make him stop talking.
2. A tower nobody else can reach: claim it, and let the city know you did.
3. A guard at a closed church, who has been allowed to think the noises are pigeons.
4. A rival's perch. Take it by being seen to take it.
5. A night watchman who noticed too much and can be taught to notice less.
6. A site under scaffold where the stone is yours again, and the builders are leaving tomorrow.

### Wendigo
1. A frozen hunting cabin, a body that has already been left behind.
2. A mortuary with a new intake and an unlocked side door.
3. A shelter's overflow tent: someone no one would ask after.
4. A hospital's incinerator room, and a porter who looks away for money.
5. A dead man's flat, found before anyone else has found it.
6. A kitchen that sells meat to people who don't ask what kind.

### Werewolf
1. A park at three a.m. and a lone runner with something to prove.
2. A scrap yard where the dogs have gone quiet and a stranger has come in.
3. A pack challenge: someone has to be put in their place, tonight.
4. A bar fight that only needs a push.
5. A forest edge and a hunt that ends in a clean kill, with no one watching.
6. A rival's boundary, crossed on purpose, and the answer that comes.

### Witch/Warlock
1. A crossroads and a coin that someone will have to be willing to give up.
2. A bargain: a secret traded for a secret, signed in your own hand.
3. A name written on a candle, burned down with its owner none the wiser.
4. A wake: the grieving are generous, and the dead listen.
5. An heirloom, handed over by someone who was never told what it costs.
6. A client who needs a spell cast and will not ask what the price is.

### Hunter
1. A call to someone who'll hear the whole thing and not flinch.
2. Your safehouse, if you can still reach it clean.
3. A chapel left open at night, and an hour with nothing in it but you.
4. A hunt with a real trail: one thing, found and ended without help.
5. The one friend you haven't lied to yet. How much do you tell them?
6. A quiet kill at the edge of town, and a clean walk home.

### Ghost
1. The room where it happened, exactly as it was left.
2. The living person you're tied to, asleep, not knowing you're there.
3. A keepsake in a pawnshop window that is going to be sold tomorrow.
4. Someone asleep in a cold flat, whose warmth you can take.
5. The unfinished thing: an unsent letter, an unpaid debt, a question nobody answered.
6. A mirror, a gate, a threshold: any place the tether runs thin.

### Revenant
1. A rival's office after hours, a ledger in the drawer.
2. A graveside, where the one wronged has never been told.
3. The target's front step at the hour they leave for work.
4. A courtroom gallery on the day a verdict is due.
5. A letter box, a long-delayed payment, a bus to a town you left.
6. The kitchen of someone who owes the dead a word.

### Changeling
1. A christening, a wedding or a retirement party, and a joyful face in the crowd.
2. A kitchen table where someone is in the middle of a bargain they do not understand.
3. A hospital waiting room and a mother who has just been told the good news.
4. A crossroads or a footbridge at the turn of the night.
5. A schoolyard at the end of term, and a child laughing about nothing.
6. A shop with a lost-and-found box, a desperate customer and a favour that can be traded.

### Doppelgänger
1. A grieving household that has lost someone and is glad of a replacement at the table.
2. A flat whose owner has been missing a week, and a neighbour who already waves.
3. A wedding party, where everyone assumes you're another cousin.
4. A night-shift workplace with a locker full of someone's coat and badge.
5. A hospice, with a relative who hasn't visited in years.
6. A student house where the quiet one left for a month and nobody asked.

### Rusalka
1. A quay at 3 a.m. and a drunk who wants to sit at the edge.
2. A river-bank bar where the lights over the water make everyone romantic.
3. A late ferry, almost empty, and a passenger who stays on deck.
4. A bridge where lovers pledge things to each other, and one has been left behind.
5. A summer swim at a quiet bend, and a stranger who says yes to a dare.
6. A canal-side garden party and a guest who steps out for air.

## What goes wrong (1d20)
1. They aren't alone. The one you chose is already someone's.
2. It's not who it seems. Their blood, their flesh, their fear is wrong.
3. A phone, a camera, a witness: a flash, and the Mask Slips.
4. Too much. You don't stop when you should. Stress +1, and someone is hurt.
5. Too little. It doesn't take, and the hunger sharpens.
6. They recognise you from somewhere you never mentioned.
7. A Connection calls at the worst moment, and you have to answer or explain why not.
8. The place is watched, and not by anyone you thought.
9. You find what they were carrying and it changes the night.
10. Someone else gets there first, and leaves a message in what's left.
11. The feeding works, and something of theirs stays with you: a craving, a memory, a habit.
12. A stranger sees the end and decides to help, which is worse.
13. They are dying anyway, and say something you will not be able to forget.
14. A Condition from earlier tonight has made this harder than it should be.
15. They fight back, and they know how.
16. They beg, by name, and the name is one you know.
17. Someone starts a clean-up before you've finished, and it isn't yours.
18. The Beast takes the wheel for a moment. Ask the player what it did, then make it worse.
19. Something about them is sick in a way you're about to carry too.
20. You are interrupted by a rival of your own Kind, and they were waiting to be seen.

## Who notices (1d20)
Roll when the feeding was loud, careless, or already watched.
1. A neighbour who was awake, who doesn't call anyone, not yet.
2. A beat police officer, who writes it down and keeps the notebook.
3. A cleaner, a porter, a taxi driver: the people no one counts as people.
4. A journalist who has been collecting exactly this.
5. A Vampire court's eyes, or a rival Kind's, as a matter of course.
6. A Vigil cell, who add it to a map you didn't know existed.
7. A Connection of yours, who says nothing and goes quiet.
8. A child at a window.
9. The victim's family, in the morning, with a photograph.
10. A priest, a doctor, a carer: someone paid to know what they see.
11. A Ghost who lives in the place and has opinions about it.
12. A stranger who realises what they saw and starts looking for you.
13. A security guard replaying footage and pausing at the wrong second.
14. A Witch or Warlock, who's been waiting for a favour to trade.
15. A rival hunter, who now knows where you feed.
16. A friend of the victim, who joins the dots with the wrong answer.
17. The Concord's local enforcer, who is displeased, and not shouting.
18. Someone who needed you to be seen, and arranged for the right person to be there.
19. No one, tonight. But a trace remains for the one who looks.
20. Roll twice: the first saw, the second understood.

Use when a character goes looking for a feed, when a feed goes badly, or when you need to decide who has seen what.`,
};
