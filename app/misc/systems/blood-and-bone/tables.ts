/**
 * Blood & Bone, AI edition: miss tables and oracles.
 * Original text for the GM, condensed from the author's rulebook
 * (docs/blood-and-bone/rulebook.md). Not copied from any other product
 * (decision 3).
 */
import type { BuiltinNote } from "../types";

export const TABLE_NOTES: BuiltinNote[] = [
  {
    id: "builtin:blood-and-bone:miss-tables-generic-moves",
    title: "B&B — Miss tables: generic moves",
    type: "table",
    tags: ["Blood & Bone","Miss table"],
    content: `Roll 1d6 on the table for the move that missed, then make the result specific to the scene. A matched miss: roll twice, or apply one result at double severity. If the fiction already tells you the cost, skip the roll. If nothing fits: Stress +1.

**Face Danger — miss**
1. You're hurt. Take a Troublesome Condition.
2. You're caught, cornered, or held — you're not going anywhere for now.
3. You succeed at the wrong thing. The obstacle is passed, but you've made a worse one.
4. Someone sees you do something you can't explain. Exposure +1.
5. You lose something in the attempt — gear, a Relic, your footing at the worst moment.
6. Your Stress escalates immediately by 1. The Beast argued, and you listened.

**Secure An Advantage — miss**
1. Your preparation is discovered, and now they're prepared for *you*.
2. You've prepared for the wrong thing entirely. The threat isn't what you assumed.
3. Time you didn't have is gone. The window has closed or is closing.
4. What you set up works, but for someone else's benefit.
5. A resource is consumed for nothing — materials, a favour, a Relic's use.
6. Someone you involved in the setup is now exposed by it.

**Gather Information — miss**
1. You learn something true, terrible, and about yourself.
2. The information is deliberately false, and you believe it.
3. Your asking gets back to the wrong person immediately.
4. The source is unwilling, gone, or dead — and recently.
5. You find a body, a scene, or evidence of something worse than what you were investigating.
6. You learn it, but the knowing costs you: Stress +1, or a Connection's trust.

**Compel — miss**
1. They refuse, and they tell someone who matters what you asked for.
2. They agree, and they're lying. You won't find out until it matters.
3. You've frightened them badly enough that they do something desperate.
4. You get what you asked for and it's the wrong thing entirely.
5. They counter-offer, and the terms are worse than you'd have accepted an hour ago.
6. Something in how you asked showed them what you are. Exposure +1.

**Slip Away — miss**
1. You're caught. Whatever that means here, it happens.
2. You escape, but not everyone does. Someone with you is taken or left.
3. You get out and leave a clear trail. They'll be along shortly.
4. You escape into somewhere worse than what you were fleeing.
5. You drop, break, or abandon something you needed.
6. You're seen escaping in a way no human could. Exposure +1.

**Aid Another — miss**
1. You get in their way. They roll at −1 and blame you, correctly.
2. Your help exposes you both to something neither of you saw.
3. You take the consequence that was meant for them, in full.
4. What you offered wasn't yours to offer. Someone else pays for it.
5. They see something in how you helped that changes how they see you.
6. Your Stress escalates by 1. Helping cost you something you were holding together.

**Undertake A Journey — miss**
1. You're intercepted en route by someone who knew you'd come this way.
2. The route is closed, collapsed, claimed, or watched. You need another.
3. You arrive, but far later than you needed to. Something has already happened.
4. Supplies, transport, or a companion are lost along the way.
5. You're followed for the entire journey and only realize at the end.
6. The journey itself marks you. Take a Condition, or Stress +1.

**Face Defeat — miss**
1. You wake somewhere else, held, with time missing.
2. You lose the thing the fight was about, permanently.
3. Someone who was relying on you pays for the loss instead of you.
4. Your defeat is witnessed, and the story spreads. Exposure +1.
5. Take a Grave Condition. Something isn't coming back.
6. Take the **Doomed** or **Indebted** Burden. Whoever beat you now owns something of yours.`,
  },
  {
    id: "builtin:blood-and-bone:miss-tables-beast-and-recovery",
    title: "B&B — Miss tables: beast and recovery",
    type: "table",
    tags: ["Blood & Bone","Miss table"],
    content: `Roll 1d6 on the table for the move that missed, then make the result specific to the scene. A matched miss: roll twice, or apply one result at double severity. If the fiction already tells you the cost, skip the roll. If nothing fits: Stress +1.
Resist the Hunger: a miss uses the Sate the Beast table.

**Sate the Beast — miss**
1. You drain them dry. Whatever you meant to do, this is what you did.
2. You attack the wrong target — someone who wasn't prey, and might have been a Connection.
3. You feed and it isn't enough. Stress +1 instead of decreasing.
4. There's a witness, and they got away, and they were recording.
5. You come back to yourself somewhere else, later, with no memory of the interval.
6. You're interrupted mid-feed by something that now knows exactly what you are.

**Steel the Resolve — miss**
1. The person you reached for isn't there, or won't answer.
2. Your safe place isn't safe anymore, and you find out by arriving.
3. The routine fails. Whatever you use to hold yourself together stops working tonight.
4. You say more than you meant to, to someone who shouldn't have heard it.
5. An old Condition, wound, or grief resurfaces at full strength.
6. You do something to feel steady that you'll have to answer for later.

**Resisting the Change — miss**
1. You turn, fully, in the worst available place.
2. You turn, and you're conscious for all of it and in control of none of it.
3. You hold, barely, and take a Troublesome Condition doing it.
4. You turn and hurt someone. The GM decides who — it should be someone who matters.
5. You lose the night. You wake with the change spent and no account of it.
6. Someone sees the change happen. Exposure +2.

**Surrender To the Years — miss**
*(In addition to the Burden and immediate threat the move already specifies.)*
1. Your beast built something in your absence — a following, a reputation, a body count.
2. Someone you loved spent the missing years looking for you, and stopped.
3. A Haven or Relic of yours was taken and is now held by someone who knows what it is.
4. You're wanted — by mortal authorities, your own Kind, or the Vigil.
5. Someone you turned, made, or bound was left to survive alone. They did, and they remember.
6. A Connection you burned during the lost years is now an antagonist with a name.`,
  },
  {
    id: "builtin:blood-and-bone:miss-tables-skirmish-and-making",
    title: "B&B — Miss tables: skirmish and making",
    type: "table",
    tags: ["Blood & Bone","Miss table"],
    content: `Roll 1d6 on the table for the move that missed, then make the result specific to the scene. A matched miss: roll twice, or apply one result at double severity. If the fiction already tells you the cost, skip the roll. If nothing fits: Stress +1.

**Resolve the Skirmish — miss (any roll)**
1. You're hit hard. Take a Troublesome Condition.
2. You lose your footing, your weapon, or your position.
3. An ally is exposed, hurt, or separated from you.
4. Reinforcements, witnesses, or authorities arrive.
5. The environment turns — fire, collapse, water, alarm, sunrise.
6. Your control slips. Stress +1, and everyone present saw something.

**The Making — miss**
*(In addition to the failed turning the move already specifies.)*
1. What comes back is fast, feral, and gone into the city before dawn.
2. They come back wrong and *aware* of it, and they blame you correctly.
3. They don't come back at all, and someone was expecting them home.
4. It works, but something else came through with them.
5. Your own Kind's authority learns of it within the night.
6. You feel a piece of yourself go into the making. Beast +1, beyond the standard cost.`,
  },
  {
    id: "builtin:blood-and-bone:miss-tables-masquerade-and-recovery",
    title: "B&B — Miss tables: masquerade and recovery",
    type: "table",
    tags: ["Blood & Bone","Miss table"],
    content: `Roll 1d6 on the table for the move that missed, then make the result specific to the scene. A matched miss: roll twice, or apply one result at double severity. If the fiction already tells you the cost, skip the roll. If nothing fits: Stress +1.

**Clean Up — miss**
1. The evidence has already been copied, uploaded, or handed on.
2. Your cleanup is itself witnessed, and it looks worse than the original incident.
3. The person you paid, threatened, or trusted talks anyway.
4. You destroy the wrong thing — something you needed goes with it.
5. Mortal authorities log your interference. City Heat +1.
6. Someone with authority over you learns you've been cleaning up after yourself.

**Clear A Condition — miss**
1. It worsens. Raise the Condition's rank by one step.
2. Infection, complication, or rejection. Take a second, related Condition.
3. Healing requires something you don't have and will have to go get.
4. Whoever treated you asks a question you can't answer, or wants something.
5. It heals wrong. The Condition becomes Permanent as a cosmetic or minor lasting mark.
6. You push through too early and undo the progress entirely. Clear the track.

**Fulfil Your Vow — miss**
1. You were working from a false premise. Someone fed you the wrong thing, deliberately.
2. You've achieved it, and it doesn't fix what you thought it would fix.
3. Someone else completed it first, and took what you wanted from it.
4. The Vow was always bigger than you understood. Raise its rank by one.
5. Fulfilling it requires something you swore you wouldn't do.
6. The person you swore it for no longer wants it, or is no longer there to want it.

**Repair A Bond — miss**
1. They say the thing neither of you has said, and it's true.
2. They've already moved on and didn't tell you.
3. They ask you for something you can't give and won't lie about.
4. They've learned what you are, or what you've done. Exposure +1.
5. The Connection drops a rank instead of holding.
6. They agree to everything, warmly, and mean none of it.`,
  },
  {
    id: "builtin:blood-and-bone:oracles-complication",
    title: "B&B — Oracles: complication",
    type: "table",
    tags: ["Blood & Bone","Oracle"],
    content: `Roll 1d10:
1. A Connection is endangered or compromised.
2. A witness sees something they shouldn't. Exposure +1.
3. Your Stress escalates immediately by 1.
4. You take a Condition.
5. Something you need is lost, broken, or taken.
6. An enemy learns where you are, or who you are.
7. A Haven, Companion, or Relic is threatened.
8. The situation escalates — more enemies, less time, worse ground.
9. You succeed, but at a moral cost you'll carry.
10. Something from your past resurfaces at the worst moment.

Use when a miss has no table of its own, or the situation is stranger than the table covers.`,
  },
  {
    id: "builtin:blood-and-bone:oracles-scene",
    title: "B&B — Oracles: scene",
    type: "table",
    tags: ["Blood & Bone","Oracle"],
    content: `Roll 1d10:
1. Nothing. The quiet is real, and you should use it.
2. Someone is already here, and they were waiting.
3. Evidence of something that happened recently.
4. A mortal in the wrong place.
5. A rival's work, unmistakably.
6. An opportunity you didn't plan for.
7. A trap, or something that functions as one.
8. Someone you know, in a context that makes no sense.
9. The aftermath of violence.
10. Something wrong that you can't name yet.

Use when you do not know what a new scene contains.`,
  },
  {
    id: "builtin:blood-and-bone:oracles-what-they-want",
    title: "B&B — Oracles: what they want",
    type: "table",
    tags: ["Blood & Bone","Oracle"],
    content: `Roll 1d10:
1. Money, or its equivalent.
2. Safety — theirs or someone else's.
3. Information you have.
4. Revenge, and they've waited.
5. Status within their own faction.
6. To be left alone, completely.
7. Someone found — alive or otherwise.
8. Something destroyed.
9. A debt paid, in either direction.
10. Something you'd never guess. Roll twice and combine.

Use when you do not know an NPC's motive.`,
  },
];
