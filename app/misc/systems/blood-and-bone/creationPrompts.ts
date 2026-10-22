/**
 * Blood & Bone, AI edition: creation prompts, one note per Kind.
 * Original text for the GM, condensed from the author's rulebook
 * (docs/blood-and-bone/rulebook.md). Not copied from any other product
 * (decision 3).
 */
import type { BuiltinNote } from "../types";

export const CREATION_PROMPT_NOTES: BuiltinNote[] = [
  {
    id: "builtin:blood-and-bone:creation-prompts-vampire",
    title: "B&B — Creation prompts: Vampire",
    type: "table",
    tags: ["Blood & Bone","Creation prompts"],
    content: `Roll 1d6 for each question below, or pick the answer that speaks to you. Each question has its own six answers. The first six are for any Vampire; the rest belong to one Archetype (named at the start of the question). Use during creation Step 8, or any time a quick answer helps.

**How do you feel about what you've become?**
1. I mourn who I was every single night.
2. I've made peace with it — this is just what I am now.
3. I pretend I haven't changed at all.
4. I think I was always meant for this.
5. I hate it, and I hate myself more for craving it.
6. I haven't let myself think about it yet.

**Who turned you, and what's left of that relationship?**
1. They're gone — dead, disappeared, or destroyed by my hand.
2. They still watch over me, whether I want them to or not.
3. I don't know who they were. I woke up alone.
4. We were enemies before, and nothing's changed since.
5. They regret it. I remind them why every time we speak.
6. I begged for it. They didn't want to say yes.

**What do you miss most about being mortal?**
1. Eating a meal with people I loved, for no reason but company.
2. Sunlight on my skin. I didn't know it was a gift until it became poison.
3. Sleep that wasn't just the day forcing me under.
4. Not being afraid of what I'd do if I lost control.
5. Aging. Growing old with someone.
6. Nothing. I don't let myself miss it.

**How do you see mortals now?**
1. Cattle. It's simpler if I don't complicate it.
2. People, still — which is exactly the problem.
3. A performance I give for my own survival.
4. Something I envy more than I'll ever admit.
5. Tools, allies, or obstacles. Nothing more.
6. I still fall for them. Every time. It never ends well.

**What's your relationship to the city's Vampire politics?**
1. I avoid it entirely. Territory means targets.
2. I'm climbing it, deliberately and patiently.
3. I was born into it and never got a choice.
4. I broke from it and I'm hunted because of that.
5. I use it. Everyone's a resource if you're patient.
6. I don't understand it, and that terrifies people who assume I should.

**What's the closest you've come to losing yourself completely?**
1. A feed I don't fully remember the end of.
2. A person I loved, and almost drained without meaning to.
3. Starvation, once, that lasted far too long.
4. A moment of rage that scared even me.
5. I haven't yet. I'm dreading the day I do.
6. Every single night. I just hide it well.

**Abstinent — Why do you refuse human blood?**
1. I've seen what it does to the ones who don't refuse.
2. A promise I made to someone, living or dead.
3. Faith — of some kind, in something.
4. I'm afraid of what I'd become if I started.
5. I still think of myself as human, and this is how I prove it.
6. Guilt. I fed on someone once, and I won't again.

**Abstinent — What's the hardest part of staying disciplined?**
1. The hunger doesn't care about my convictions.
2. Other Vampires who see my restraint as weakness.
3. Being near blood and pretending it doesn't call to me.
4. Loved ones who don't understand why I keep myself apart.
5. Doubting, some nights, whether it's even worth it.
6. Watching someone I could save bleed, and doing nothing.

**Abstinent — Who or what keeps you accountable?**
1. A mentor who walked this path before me.
2. A mortal who doesn't know the truth but somehow keeps me grounded.
3. A private ritual I never skip, no matter what.
4. Fear, plain and simple.
5. Nobody. I do this alone, and it's harder for it.
6. A group of others like me. We watch each other.

**Ripper — What was the moment you stopped fighting the hunger?**
1. I realized fighting it only made the hunger worse.
2. Someone showed me how good it could feel, and I never looked back.
3. I lost someone, and stopped caring what I became after.
4. I tried to resist once. It nearly killed someone I loved.
5. There wasn't a moment. I never really fought it at all.
6. I told myself it was just once. I was wrong.

**Ripper — Who's been hurt worst by your appetite?**
1. A stranger whose name I never even learned.
2. Someone who trusted me completely.
3. My own reputation — I can't hide in this city anymore.
4. A Connection who finally gave up on me.
5. Nobody yet. But I know it's coming.
6. Someone who tried to stop me, and couldn't.

**Ripper — Do you regret what you've become?**
1. No. I've never felt more like myself.
2. Only in the mornings, when it's too late to matter.
3. I regret who I've hurt, not what I am.
4. I used to. I've stopped letting myself feel it.
5. Every single time, and it never stops me.
6. Regret is for people who still think they have a choice.`,
  },
  {
    id: "builtin:blood-and-bone:creation-prompts-gargoyle",
    title: "B&B — Creation prompts: Gargoyle",
    type: "table",
    tags: ["Blood & Bone","Creation prompts"],
    content: `Roll 1d6 for each question below, or pick the answer that speaks to you. Each question has its own six answers. The first six are for any Gargoyle; the rest belong to one Archetype (named at the start of the question). Use during creation Step 8, or any time a quick answer helps.

**How do you deal with what you look like now?**
1. I've built my whole life around never being seen.
2. I've stopped caring who sees me. Let them scream.
3. I've found others who understand. It's not so lonely.
4. I use it — fear is a tool, and I'm good with tools.
5. I still cry about it, some nights, in private.
6. I think it's beautiful. Everyone else is wrong.

**What does your hidden territory mean to you?**
1. It's the only thing I've ever truly owned.
2. It's a prison I built myself.
3. I share it. Loneliness is worse than risk.
4. I'd kill anyone who threatened it. I have.
5. It's temporary — I'm always ready to run.
6. It used to belong to someone I loved.

**How did you first learn to hide what you are?**
1. Someone else like me taught me, once, then vanished.
2. Trial and error, and a lot of close calls.
3. I never really learned — I just got lucky, over and over.
4. Isolation taught me. There was no one else to ask.
5. I studied mortals obsessively, learning to imitate what I'm not.
6. I haven't. I've just never been caught. Yet.

**What do you think about when the sun starts to rise?**
1. Relief — a few hours where nothing can be asked of me.
2. Fear. Stone Slumber means total helplessness, and I hate it.
3. Whoever knows where I sleep, and whether I can trust them.
4. Nothing. I've made my peace with the ritual of it.
5. What I'll have missed by the time I wake.
6. The last time someone found me sleeping, and what happened after.

**Who, if anyone, knows what you really are?**
1. One person, and I'm terrified every day they'll tell someone.
2. A small circle who protect the secret as fiercely as I do.
3. No one living. I've made sure of that.
4. Someone who found out by accident and hasn't left.
5. My territory's other hidden residents. We're careful with each other.
6. Someone who's using that knowledge against me right now.

**What would you do to protect your secret?**
1. Almost anything. I've already done things I don't discuss.
2. I'd run before I'd hurt someone innocent to keep it.
3. I don't know yet. I haven't been tested.
4. I'd let it out, honestly, before I'd become a monster to hide it.
5. Whatever it takes. That's not a metaphor.
6. I'd ask for help before I did anything drastic. I hope.

**Warden — Who is it you're protecting?**
1. A community that doesn't know I'm the reason they're safe.
2. One person, specifically, above everyone else.
3. Other Gargoyles who can't protect themselves.
4. Mortals I've grown attached to, against my better judgment.
5. Nobody yet — I'm still looking for who needs me.
6. Someone I failed once, and I've never stopped trying to make up for it.

**Warden — What's the cost of protecting without violence?**
1. People I could have stopped faster if I'd been willing to hurt them.
2. My own safety, constantly put second.
3. Trust from other Gargoyles who think I'm naive.
4. Exhaustion. Restraint takes more out of me than force ever would.
5. Nothing yet. I haven't been pushed far enough to find the line.
6. A reputation as weak, which I've learned to use to my advantage.

**Warden — What would make you break your own rule?**
1. Someone I love, in immediate danger, with no other option.
2. I don't think anything would. That scares people who know me.
3. I already broke it, once, and I'm still not sure I regret it.
4. Watching the same threat hurt someone twice.
5. Nothing has yet, but I think about it more than I'd like.
6. Betrayal from someone I trusted with the secret.

**Tyrant — How did you build your reputation?**
1. One act of violence, publicized far past what actually happened.
2. Slowly, deliberately, one terrified witness at a time.
3. I didn't build it. Someone else did, and I inherited the fear.
4. An accident that I chose to lean into afterward.
5. I let the stories grow wilder than the truth, and never corrected them.
6. I earned it the hard way, and I don't regret a single part.

**Tyrant — What happens when someone doesn't fear you?**
1. It unsettles me more than I'd admit.
2. I make sure it doesn't happen twice.
3. I almost respect it, which is its own kind of problem.
4. I escalate until they understand.
5. I've started to wonder if I even want to be feared anymore.
6. I test them, to see if the fearlessness is real or performance.

**Tyrant — Who remembers you as something other than a monster?**
1. No one. That's exactly how I've arranged it.
2. Someone from before, who I've cut off completely.
3. One person I still let close, against every instinct.
4. I don't know if anyone does, and I'm not sure I want to know.
5. Someone who's terrified of what I'd do if they reminded me.
6. Myself, some nights, and I hate how much it aches.`,
  },
  {
    id: "builtin:blood-and-bone:creation-prompts-wendigo",
    title: "B&B — Creation prompts: Wendigo",
    type: "table",
    tags: ["Blood & Bone","Creation prompts"],
    content: `Roll 1d6 for each question below, or pick the answer that speaks to you. Each question has its own six answers. The first six are for any Wendigo; the rest belong to one Archetype (named at the start of the question). Use during creation Step 8, or any time a quick answer helps.

**How do you deal with your new side?**
1. I like it.
2. I starve myself as long as I can stand it, just to delay.
3. I've built rituals to control it — it never controls me.
4. I don't think about it until I have to.
5. I confess everything to someone, every time. It's the only way I stay sane.
6. I've stopped calling it a curse. It's just hunger now.

**What haunts you most about what you've done?**
1. The first time. I remember every detail.
2. Nothing. I've made my peace with all of it.
3. The person who could have stopped me and didn't.
4. How easy it got, the second time.
5. The ones I could have saved and chose not to.
6. That I'm not sure I want to stop.

**How were you cursed?**
1. Starvation, somewhere remote, with no other option left.
2. A ritual gone wrong that I still don't fully understand.
3. I asked for it, not knowing what I was asking.
4. Someone else's curse, passed to me somehow.
5. Punishment — deserved or not, I still believe it was.
6. I don't remember. I just woke up different.

**What does your human mask cost you to maintain?**
1. Constant, exhausting vigilance over every word and expression.
2. Nothing anymore — it's easier than being honest ever was.
3. Relationships. People sense something's wrong, even if they can't say what.
4. A private ritual I perform daily, just to keep steady.
5. My own sense of which face is real anymore.
6. Very little — starving myself keeps the mask on, whatever it costs elsewhere.

**Who do you fear finding out the truth?**
1. My family. I'd rather die than watch their faces.
2. Nobody. There's no one left to lose.
3. Someone I've fallen for, recently, against my better judgment.
4. Other Wendigos who might see me as competition, not kin.
5. The authorities — mortal or otherwise.
6. Myself, honestly. I'm not sure I want to know either.

**What's your relationship to snow and cold?**
1. I avoid it entirely — it wakes something I don't want awake.
2. I've learned to use it, timing my hunts to it.
3. It reminds me of where I was cursed, and I can't escape that.
4. I barely notice it anymore. I've adapted.
5. It's when I feel closest to what I really am.
6. I moved somewhere warm just to put distance between us.

**Graverobber — How did you decide never to kill?**
1. I watched what killing did to another Wendigo, and refused that fate.
2. A promise to someone I've since lost.
3. I tried it once. I've never done it again.
4. Faith, or something like it, that this matters more than survival.
5. Fear of what I'd become if I crossed that line.
6. I didn't decide — I just never found it in me to cross it.

**Graverobber — Where do you find your food?**
1. Morgues, and the people who look the other way for a price.
2. Battlefields, disaster sites — wherever death gathers naturally.
3. A network of contacts who know what I need and don't ask why.
4. Graves, dug quietly, alone, at night.
5. Hospitals, hospices — places where death is expected, not caused.
6. I scavenge opportunistically, wherever the dead already are.

**Graverobber — What do you tell yourself to make it bearable?**
1. They're already gone. I'm not the one who hurt them.
2. This is dignity, in a strange way — using what would otherwise be wasted.
3. Nothing. I just do it and try not to think too hard.
4. I imagine they'd understand, if they could.
5. It's still better than the alternative, whatever anyone else thinks.
6. I don't need to tell myself anything anymore. It's just what I do.

**Predator — What was your first kill like?**
1. Terrifying, and I've chased that intensity ever since.
2. Clumsy — I've gotten much better since.
3. Almost peaceful. I didn't expect that.
4. A blur. I don't remember most of it.
5. Necessary, and I've never once regretted it.
6. The moment I stopped pretending I was still human.

**Predator — How do you choose your prey?**
1. Whoever won't be missed. I've gotten good at spotting them.
2. Whoever deserves it, in my judgment.
3. Opportunity. I don't plan far ahead.
4. I don't choose. The hunger chooses for me.
5. Strangers, always. Never anyone I could grow attached to.
6. I hunt the way I used to hunt animals, before the curse.

**Predator — What's left of the person you were before the curse?**
1. Almost nothing. I've stopped looking for them.
2. A name, and not much else.
3. Enough that it still hurts, some nights.
4. My memories, intact, which is somehow worse.
5. A single relationship I still, barely, hold onto.
6. I think about that less than I probably should.`,
  },
  {
    id: "builtin:blood-and-bone:creation-prompts-werewolf",
    title: "B&B — Creation prompts: Werewolf",
    type: "table",
    tags: ["Blood & Bone","Creation prompts"],
    content: `Roll 1d6 for each question below, or pick the answer that speaks to you. Each question has its own six answers. The first six are for any Werewolf; the rest belong to one Archetype (named at the start of the question). Use during creation Step 8, or any time a quick answer helps.

**What's your relationship to your pack?**
1. They're my entire world. I'd die for any of them.
2. I lead them, and the weight of that never lifts.
3. I was cast out. I still don't know why.
4. I left on my own terms, and I don't regret it.
5. I'm new. I haven't earned my place yet.
6. I'm searching for a pack I haven't found yet.

**How do you feel when the moon pulls at you?**
1. Relief. Finally, I get to stop pretending.
2. Terror. I never know who I'll hurt.
3. Powerful, in a way nothing else makes me feel.
4. Numb. I've turned so many times it doesn't register anymore.
5. Grief. I remember what I was like before.
6. Excited. I count the days until the next one.

**How were you turned or born into this?**
1. Bitten, and I still remember exactly who did it.
2. Born to it — my whole family carries the same curse.
3. I chose it, somehow, though I question that choice constantly.
4. An attack I barely survived, that changed everything after.
5. I don't fully know. I woke up different one full moon.
6. A ritual, deliberate and planned, that I agreed to.

**What does dominance mean to you personally?**
1. Safety. The higher I stand, the less I have to fear.
2. Nothing I actually want, but something I can't stop chasing.
3. Respect, earned honestly, not just taken by force.
4. A game I've learned to play better than anyone.
5. A burden I never asked for and can't put down.
6. Proof that I belong here, when everything else says I don't.

**Who taught you to control the change, if anyone?**
1. An elder who's since passed, or moved on.
2. Nobody. I taught myself, badly, through trial and error.
3. My pack, collectively, the way you'd raise any of their own.
4. A rival, of all people, who saw potential in me.
5. I haven't learned control yet, and it terrifies me.
6. A book, a ritual, something old and half-understood.

**What's the worst thing you've done while transformed?**
1. Hurt someone I loved, badly, without meaning to.
2. Something I still can't fully remember, and that scares me more.
3. Nothing yet — I've been lucky, or careful, or both.
4. Something I'd do again, without hesitation.
5. Broken a promise I'd made to myself about control.
6. Revealed the truth to someone who wasn't supposed to know.

**Packbound — What would you sacrifice for your pack?**
1. Everything. There's no line I wouldn't cross for them.
2. Almost everything, except the parts of myself I'm still holding onto.
3. My safety, without a second thought.
4. My relationship with someone outside the pack, if it came to that.
5. I don't know yet. I hope I never have to find out.
6. My own dominance, gladly, if it kept them safe.

**Packbound — What's your role within the pack?**
1. Protector — the one who steps between danger and everyone else.
2. Peacemaker — I keep the pack from tearing itself apart.
3. The newest member, still proving myself every day.
4. Second to the alpha, trusted but never quite equal.
5. The one who remembers what the pack has been through.
6. I don't have a fixed role. I go wherever I'm needed most.

**Packbound — What happens to you without the pack nearby?**
1. I unravel, faster than I'd like to admit.
2. I function, but everything feels muted, wrong.
3. I've never actually tested it, and I'm afraid to.
4. I get reckless, taking risks I wouldn't take with them around.
5. I search for something to fill the gap, and it never works.
6. The hunger for dominance gets sharper, hungrier, worse.

**Rogue — Why did you leave, or why were you cast out?**
1. I broke a rule I still don't think was wrong to break.
2. A dominance challenge I lost, badly, and couldn't come back from.
3. I chose myself over the pack, once, and paid for it.
4. Nobody ever told me. I just stopped being welcome.
5. I left to protect them from something I'd become.
6. I never had a pack to begin with. This has always been my normal.

**Rogue — What do you miss least about pack life?**
1. The politics. Constant, exhausting, and never worth it.
2. Nothing. I don't let myself miss any of it.
3. Answering to someone else's idea of what I should be.
4. The violence dominance challenges demanded of everyone.
5. Being defined by my place in someone else's hierarchy.
6. I miss more than I let on, honestly.

**Rogue — How do you survive the full moon alone?**
1. I find somewhere remote, and I ride it out by myself.
2. Badly. It's the hardest night of every month.
3. I've built rituals that don't need a pack to work.
4. I don't survive it so much as endure it.
5. I've found others like me — not a pack, just company.
6. I've stopped fighting it. I let it take what it wants.`,
  },
  {
    id: "builtin:blood-and-bone:creation-prompts-witch-warlock",
    title: "B&B — Creation prompts: Witch/Warlock",
    type: "table",
    tags: ["Blood & Bone","Creation prompts"],
    content: `Roll 1d6 for each question below, or pick the answer that speaks to you. Each question has its own six answers. The first six are for any Witch/Warlock; the rest belong to one Archetype (named at the start of the question). Use during creation Step 8, or any time a quick answer helps.

**What drove you to this power in the first place?**
1. Desperation. I needed something I couldn't get any other way.
2. Curiosity. I wanted to know what was really out there.
3. Revenge. Someone hurt me, and I wanted the means to answer it.
4. Inheritance. This was never really my choice.
5. Grief. I was trying to bring someone back.
6. Ambition. I wanted more than the life I was given.

**What's your relationship to your Ledger?**
1. I track every mark obsessively. I know exactly what I owe.
2. I try not to think about it until it's due.
3. I've stopped believing it's really keeping score.
4. Someone else's debt got tangled into mine, and I'm still paying it.
5. I've made peace with what it'll eventually cost me.
6. I'm terrified of it, and I keep casting anyway.

**What is your source of power, exactly?**
1. A pact with something I never fully understood the terms of.
2. Inherited knowledge, passed down a family line older than I know.
3. A relic I found, or was given, that I've never let go of.
4. A spirit bound to me, more partner than servant.
5. Study alone — no pacts, no inheritance, just relentless work.
6. Something I don't fully understand myself, even now.

**Who else knows what you really are?**
1. A coven or circle who see me exactly for what I am.
2. Nobody living. I've kept this entirely to myself.
3. A mortal partner who's chosen to stay despite the truth.
4. Family, who've known since before I did.
5. Rivals, who use the knowledge against me whenever they can.
6. Someone who's blackmailing me with it right now.

**What's the worst thing your power has cost you?**
1. A relationship I can't get back, no matter what I'd trade for it.
2. Years of my life, taken by the toll of the Ledger.
3. My reputation among mortals who noticed something was wrong.
4. A piece of myself I don't think I'll ever recover.
5. Nothing irreversible yet, and I'm terrified of what will be first.
6. Someone else paid the price instead of me, and I've never forgiven myself.

**How do you feel about mortals who don't know the truth?**
1. Envious. Ignorance looks a lot like peace, from here.
2. Protective. I do what I can to keep them out of this world.
3. Indifferent. Their world and mine barely overlap anymore.
4. I miss being one of them more than I let on.
5. I use that ignorance, sometimes, more than I should.
6. Amused. They have no idea what's really out there.

**Hedge Witch — Why do you keep your workings small?**
1. I've seen what large pacts do to the people who make them.
2. I don't trust myself with more power than this.
3. It's enough. I've never needed to prove otherwise.
4. Caution, plain and simple — I like staying alive.
5. A mentor taught me restraint, and it stuck.
6. Small magic is easier to hide, and hiding matters most to me.

**Hedge Witch — What do you do instead of chasing bigger power?**
1. I perfect what I already have, endlessly, patiently.
2. I help people with the small things — the things that matter day to day.
3. I study, quietly, without ever acting on most of what I learn.
4. I stay out of the politics entirely, and let others chase power instead.
5. I teach, when someone's willing to learn the careful way.
6. I wait. I'm not in a hurry the way others seem to be.

**Hedge Witch — Has anyone tried to tempt you toward more?**
1. Constantly, and I've said no every time.
2. Once, and I still think about what I turned down.
3. Yes — someone I trusted, which made it harder to refuse.
4. No one's bothered. They think I'm not worth the effort.
5. I've tempted myself, more than anyone else ever could.
6. Someone's trying right now, and I haven't decided yet.

**Servant — What does your power actually want from you?**
1. More. It's never satisfied, no matter what I give.
2. Something I still don't fully understand, and that scares me.
3. Loyalty above all else — it doesn't forgive divided attention.
4. A specific task I haven't finished, and it won't let me forget.
5. My name, eventually. I think it wants to own all of me.
6. Nothing clear. Just an endless, hungry pull.

**Servant — What's the most reckless pact you've made?**
1. One I didn't fully read the terms of before agreeing.
2. Something I made to save someone else's life, not my own.
3. A bargain with something I still can't name.
4. One I made out of pure ambition, and don't regret yet.
5. A pact that cost someone else, not me, and I let it happen.
6. I don't know which one was worst. There have been too many.

**Servant — Who do you answer to now?**
1. Whatever I'm bound to — and it's clear I'm not the one in control.
2. No one, technically, though it doesn't always feel that way.
3. A hierarchy of other Servants, above and below me.
4. Myself, still, though for how much longer I can't say.
5. Someone who holds a piece of my Ledger and knows exactly how to use it.
6. Something ancient enough that "answer to" barely applies.`,
  },
  {
    id: "builtin:blood-and-bone:creation-prompts-hunter",
    title: "B&B — Creation prompts: Hunter",
    type: "table",
    tags: ["Blood & Bone","Creation prompts"],
    content: `Roll 1d6 for each question below, or pick the answer that speaks to you. Each question has its own six answers. The first six are for any Hunter; the rest belong to one Archetype (named at the start of the question). Use during creation Step 8, or any time a quick answer helps.

**Why did you start hunting?**
1. Something took someone from me, and I couldn't let that stand.
2. I stumbled into the truth and couldn't look away again.
3. I was recruited — trained before I understood what I was agreeing to.
4. I used to be prey. I decided that was going to change.
5. It runs in my family. I was raised for this.
6. I wanted to matter. This was the first thing that let me.

**How close have you come to becoming what you hunt?**
1. Closer than I'd ever admit out loud.
2. Not close at all — my convictions haven't wavered once.
3. There was one night. I still don't talk about it.
4. I worry about it constantly, which is probably a good sign.
5. A monster showed me mercy once, and I've never been the same.
6. I think the line matters less than I used to believe.

**Who trained you, and what did they teach you that stuck?**
1. Someone who's since died, doing exactly what they trained me for.
2. A cell or order, with rules I still follow to the letter.
3. Nobody. I learned everything the hard way, alone.
4. A family member who never wanted this life for me, but gave it anyway.
5. Someone who turned out to be more monster than mentor.
6. Books, records, whatever I could scavenge before my first real hunt.

**What's the cost of this life, to the people who love you?**
1. They think I'm someone I'm not, and I let them believe it.
2. They know the truth, and they're paying for it right alongside me.
3. I've pushed everyone away. It's safer that way.
4. One relationship survived. I hold onto it fiercely.
5. I lost someone because of this life, and I've never stopped grieving it.
6. They worry constantly, and I've stopped trying to reassure them.

**What do you carry with you on every hunt?**
1. Something that belonged to the person I lost.
2. A weapon I trust more than anything else I own.
3. Doubt, always, no matter how the hunt turns out.
4. A ritual or habit I never skip, for luck or discipline.
5. Fear, that I've learned to work alongside instead of around.
6. Nothing sentimental. Just what's practical.

**How do the Vigil, or others like you, see you?**
1. As reliable — the one they call when it matters.
2. As reckless — someone they respect but don't quite trust.
3. As an outsider, still, even after everything I've proven.
4. As a legend, which is its own kind of exhausting.
5. As a cautionary tale in progress.
6. I don't know. I've never asked, and I'm not sure I want to.

**Zealot — What made your convictions this absolute?**
1. Watching someone else's mercy get them killed.
2. A single act so monstrous it erased any room for nuance.
3. Faith — of some kind, that gives the fight meaning.
4. I've simply never seen a monster who deserved otherwise.
5. Fear that hesitation is exactly what gets hunters killed.
6. I don't remember choosing this. It's just who I've always been.

**Zealot — Has anyone ever tested your certainty?**
1. Once, and it nearly broke me. I've never let it happen again.
2. No. I've never doubted, not even for a moment.
3. A monster who didn't act like one, and I hated how that felt.
4. Someone I loved, who turned out to be one of them.
5. Constantly, and every time I come out more certain, not less.
6. I test myself, deliberately, to make sure the conviction still holds.

**Zealot — What would it take for you to show mercy?**
1. Nothing. That's not a line I'm willing to move.
2. Proof beyond any doubt that they'd changed. Real proof.
3. Someone I trust completely, vouching with their own life.
4. I don't know. I've never had to answer that honestly.
5. Watching them save someone, at real cost to themselves.
6. I might already be closer to that line than I want to admit.

**Pragmatist — What monster taught you that the line isn't so simple?**
1. One who saved a life I was too late to save myself.
2. One who was, in every way that mattered, still a good person.
3. One I fought beside, out of necessity, and never regretted it.
4. One who reminded me of someone I used to be.
5. I haven't had that moment yet — I just suspect it's coming.
6. My own reflection, more than any monster ever did.

**Pragmatist — How do the Zealots in your circle see you?**
1. As a liability, someone they don't fully trust anymore.
2. As naive, someone who'll get themselves or others killed.
3. As someone they secretly agree with, but won't admit it.
4. Indifferent — they let me work my own way, mostly.
5. As dangerous, someone whose loyalties might not hold.
6. I've stopped caring how they see me.

**Pragmatist — What's the line you still won't cross, even for the greater good?**
1. I won't work with something that's actively hurting people.
2. I won't lie to the people I fight alongside about who I've helped.
3. I won't let a monster use me against my own.
4. I haven't found it yet, and that worries me more than anything.
5. I won't forgive what was done to the person I lost, whatever the reasoning.
6. I don't think I have one left. That's the part that scares me.`,
  },
  {
    id: "builtin:blood-and-bone:creation-prompts-ghost",
    title: "B&B — Creation prompts: Ghost",
    type: "table",
    tags: ["Blood & Bone","Creation prompts"],
    content: `Roll 1d6 for each question below, or pick the answer that speaks to you. Each question has its own six answers. The first six are for any Ghost; the rest belong to one Archetype (named at the start of the question). Use during creation Step 8, or any time a quick answer helps.

**What's the unfinished business that tethers you?**
1. Nobody knows the truth about how I died.
2. Someone I loved doesn't know how much I loved them.
3. I never got to finish what I started.
4. I want to see someone punished for what they did to me.
5. I'm protecting someone, and I refuse to leave until they're safe.
6. I honestly don't know. I've forgotten. That scares me more than anything.

**How do you feel about the living world now?**
1. Envious. I'd give anything to feel warm again.
2. Protective. I watch over the people I can still reach.
3. Distant. It's harder every year to remember why it mattered.
4. Angry. The world kept going like I never existed.
5. Curious. I've started to enjoy simply watching.
6. Predatory. Their warmth is the only thing that still feels like mine.

**How did you actually die?**
1. Violently, suddenly, with no time to prepare for what came next.
2. Slowly, and I had time to know exactly what I was losing.
3. I still don't fully understand it. The details won't come clear.
4. By someone's hand, and I know exactly whose.
5. Trying to save someone else, and I don't regret the trade.
6. Quietly, forgotten, in a way that still stings more than the death itself.

**Who do you watch over, and do they know you're there?**
1. Someone who senses me sometimes, but has never said so out loud.
2. Someone who has no idea I'm still here at all.
3. No one specific. I drift, and I watch whoever needs it.
4. Someone who used to know, and has since forgotten, or moved on.
5. A place, more than a person — somewhere that still matters.
6. Someone who talks to me like I can actually answer back.

**What's changed most about the world since you died?**
1. Everyone I knew is gone now too, or nearly.
2. The place itself, torn down and rebuilt beyond recognition.
3. Almost nothing, which is somehow worse than total change.
4. Technology, mostly — a world I recognize less every year.
5. The person I loved most has moved on completely, and I haven't.
6. I try not to notice. It's easier that way.

**What do you fear happening to your tether?**
1. That it'll be destroyed before I've resolved what keeps me here.
2. That someone will use it against me, deliberately.
3. That I'll forget what it even means to me.
4. That resolving it will mean I finally have to leave.
5. Nothing. I don't think about the tether — I think about what it represents.
6. That it already doesn't matter, and I'm just too stubborn to move on.

**Anchored — What keeps you tethered to helping, not harming?**
1. A promise I made, to myself or someone else, that I refuse to break.
2. Memory of who I was — someone who wouldn't do this.
3. Fear of what I'd become if I let go of that restraint.
4. The people I still watch over. I won't be the reason they're afraid.
5. Faith, of some kind, that this matters even if no one sees it.
6. I've simply never wanted to take. Giving still feels like mine.

**Anchored — Who have you helped since you died?**
1. Someone in danger who never knew what actually saved them.
2. The person my tether is bound to, over and over.
3. Other lost spirits, guiding them toward peace I haven't found myself.
4. Strangers, mostly — small things nobody notices.
5. Someone who needed to hear the truth I never got to tell in life.
6. I've helped more than I can count, and I've stopped keeping track.

**Anchored — What would it take for you to finally let go?**
1. Resolving the exact thing that's kept me here, completely.
2. Watching the person I protect find safety on their own.
3. Someone telling me the truth I've been waiting to hear.
4. I don't know if I'm ready, even if the tether resolved tomorrow.
5. Forgiving someone, or being forgiven — I'm not sure which.
6. I think I'm already close, and it terrifies me.

**Unraveling — What was the first thing you took from the living?**
1. Warmth, from someone I didn't even mean to hurt.
2. A memory, pulled loose before I understood what I was doing.
3. Something small, that I told myself didn't matter.
4. Nothing accidental — I knew exactly what I was doing.
5. My own name, from someone who used to remember it.
6. I don't remember. That's part of what worries me.

**Unraveling — How much of yourself have you already lost?**
1. Whole years. I can't account for where they went.
2. Enough that I frighten the spirits who remember who I was.
3. My face, sometimes, when I'm not concentrating on holding it.
4. Not much yet, but I can feel it starting.
5. Everything except the anger. That's the last thing to go, it seems.
6. I've lost track of how much I've lost. That's the real answer.

**Unraveling — Is there anyone trying to stop your slide?**
1. Another Ghost, one of the Anchored kind, who won't give up on me.
2. Someone living, who has no idea what they're really up against.
3. No one. I think everyone's given up, and I understand why.
4. Myself, some nights, though it's getting harder to remember why I'd bother.
5. Someone who's afraid of me now, but still tries anyway.
6. I don't want to be stopped. That might be the real problem.`,
  },
];
