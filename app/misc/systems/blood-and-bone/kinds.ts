/**
 * Blood & Bone, AI edition: the seven Kinds.
 * Original text for the GM, condensed from the author's rulebook
 * (docs/blood-and-bone/rulebook.md). Not copied from any other product
 * (decision 3).
 */
import type { BuiltinNote } from "../types";

export const KIND_NOTES: BuiltinNote[] = [
  {
    id: "builtin:blood-and-bone:vampire",
    title: "B&B — Vampire",
    type: "mechanics",
    tags: ["Blood & Bone","Kind"],
    content: `# B&B — Vampire

Stress triggers below are +1 each, once a scene each (key = the trigger's name). XP triggers pay once a session. Use the sheet's numbers; the Beast steps are already-true changes to narrate.

## The Kind
Driven by an unyielding blood addiction, vampires view mortals as cattle, blending into society to hunt.

- **Stress Escalation:** Increases when starved, when smelling fresh blood, or when exposed to direct sunlight.
- **Recover Move: Sate the Beast** – Requires drinking mortal blood.
- **Progression Triggers (XP):** 1 XP for feeding successfully without detection; 3 XP for draining a human completely dry.
- **Weakness:** Sunlight is lethal, not just uncomfortable — direct exposure causes escalating physical harm the longer they're caught in it, not merely Stress. Additionally, a vampire cannot cross a mortal threshold uninvited, no matter how dire the need.

## Archetypes
**The Abstinent** — *Feeds on animal blood, fighting the pull toward human prey.*
- Sate the Beast on animal blood: strong hit decreases Stress by only 1 (not 2) — it's incomplete nourishment.
- Never triggers a Mask Slips complication from feeding.
- +1 to any Heart roll made to resist the urge to feed on a human.
- **Archetype XP:** 1 XP for sustaining yourself on animal blood through a full night of temptation; 3 XP for refusing human blood when feeding on it would have solved your problem outright; 5 XP for convincing another Vampire to attempt abstinence.
- **Alternate XP:** 1 XP for maintaining a mortal relationship without them ever suspecting; 3 XP for being publicly mocked or threatened by other Vampires for your restraint and holding your position; 5 XP for saving a mortal from another Vampire's feeding.
- **Stress Relief:** a shared meal or ritual with a mortal who knows nothing; refusing an easy feed and sitting with the craving until it passes; tending to something living that isn't prey.

**The Ripper** — *Given fully to the addiction, feeding to excess.*
- Strong hit on Sate the Beast decreases Stress by 3 instead of 2.
- "The sight of blood" is an additional Stress Escalation trigger.
- A miss on Sate the Beast automatically includes the Mask Slips price, no choice involved.
- **Archetype XP:** 1 XP for feeding to excess and walking away before killing; 3 XP for turning your appetite into leverage over someone who feared it; 5 XP for surviving a reckoning your feeding directly caused.
- **Alternate XP:** 1 XP for feeding somewhere you had no business feeding; 3 XP for a mortal seeking you out despite knowing what you'd do; 5 XP for being hunted for your appetite and escaping clean.
- **Stress Relief:** feeding purely for pleasure rather than need; being feared by someone who once looked down on you; letting a victim live and watching them flee.

## Beast Meter track — The Thirst
1. Food and drink turn your stomach. You stop pretending at meals.
2. Your reflection unsettles you. You start covering mirrors without deciding to.
3. **(First Crack)** You stop feeling temperature. Warmth is something you notice only in other people.
4. You can no longer sleep in the presence of another person. Something in you refuses the vulnerability.
5. Your voice changes when you're hungry — a register mortals flinch from without knowing why.
6. **(Slipping)** You stop remembering the faces of people you've fed on. They blur together into one long meal.
7. You dream of the first person you killed, every day, and it's a fond dream.
8. Mortals in a room fall quiet when you enter. Nobody can say why. Children cry.
9. **(Last Warning)** You've stopped thinking of mortals as people at all. When you try, it's an effort of translation.
10. **(Control)** The thing wearing your face hunts openly now, and it does not remember your name.

## Powers
### Kind Powers

**MIST FORM**
1. You can dissolve into mist to pass through a gap, grate, or crack. You cannot carry anything larger than a pocket item, and you re-form vulnerable and disoriented. When you Slip Away through such a gap, add +1.
2. You can hold mist form for extended periods, and move at walking pace within it. When you Slip Away in mist form, add +1.
3. While in mist form, mundane weapons and physical restraints cannot touch you, and you ignore the cost of a weak hit from them. Fire, sunlight, and supernatural force still can.

**THE LONG LOOK**
1. When you Compel a mortal through eye contact, roll +Shadow instead of your usual stat.
2. On a strong hit when you Compel this way, the target doesn't clearly remember the exchange afterward — only that they agreed to something. Add +1 to your next Compel on them.
3. You can lay a lasting suggestion on a mortal that persists until fulfilled or broken by contradictory evidence. When you Compel them to act on it, add +1. Doing so raises your Stress by 1.

**BLOOD SCENT**
1. You can identify individuals by the scent of their blood, and tell at a distance whether someone is wounded, ill, or afraid. When you Secure an Advantage against someone whose blood you have smelled, add +1.
2. When you Gather Information by tracking someone's blood scent, add +2.
3. Tasting a person's blood shows you a fragment of their recent memory — a place, a face, a moment. The GM decides which. Add +1 to your next roll acting on it.

**DEAD MAN'S SPEED**
1. When you Face Danger by moving faster than a mortal can react, add +1.
2. Once per scene, you may act before anyone else in a scene can respond, no roll required.
3. During a Skirmish, you may reroll one Action Die per fight. Doing so raises your Stress by 1.

**THE OLD BLOOD**
1. Wounds that would kill a mortal close on their own within a night, provided you've fed. Ignore the cost of a weak hit that is only physical harm.
2. You can recover from catastrophic injury given time and blood. Add +1 to Face Defeat.
3. You cannot be permanently destroyed by anything short of fire, sunlight, or the deliberate, informed effort of someone who knows what you are. When you Face Defeat from anything else, add +1.

**CHILDER**
1. You have at least one vampire you turned, somewhere. Treat them as a Connection at Steady rank that cannot fall below Weak.
2. You can sense your childer's location and condition anywhere in the same city. When you Aid Another with your childe, or Gather Information through them, add +1.
3. You may call on a childe to act on your behalf without being present. Once per session, describe what they accomplish; the GM describes what it cost them.

### Abstinent Powers

**THE VINTNER'S ART**
1. Animal blood sustains you as well as human blood would: Sate the Beast on animal blood decreases Stress by 2 on a strong hit, as normal.
2. You can prepare and store blood so it keeps its potency. You always have a reserve unless the fiction has taken it from you. When you Sate the Beast on your reserve, add +1.
3. Once per session, share your reserve with another feeding Kind to reduce their Stress by 1 without them needing to hunt.

**THE HELD LINE**
1. When you resist the urge to feed on a human, add +2 to the roll.
2. Your Stress range becomes 0-7 (manage_meter remove Stress, then create it again with max 7 and the same value): restraint has taught you to carry more before you break.
3. Once per session, when you would lose control entirely, you may hold on instead: reduce Stress to 4 and take a lasting Burden of the GM's choosing.

### Ripper Powers

**FRENZY**
1. When you enter a Skirmish having deliberately let go, add +1 to all three Action Rolls. You cannot choose your objective — the fiction chooses it for you.
2. On a Decisive Victory won in frenzy, decrease your Stress by 1. The violence fed you.
3. You may enter frenzy at will, without provocation, and add +1 to your first Action Roll in it (+2 in total with the frenzy bonus). Each time you do, raise your Stress by 1 afterward.

**THE DRAINING**
1. When you drain a victim completely, decrease your Stress by 3 instead of 2.
2. Draining someone completely grants you a fragment of their skills or knowledge for the rest of the night — treat as +2 on one relevant roll.
3. You may drain a supernatural creature. Doing so decreases your Stress to 0 and grants a temporary use of one of their Powers. It also makes an enemy of everyone who knew them.`,
  },
  {
    id: "builtin:blood-and-bone:gargoyle",
    title: "B&B — Gargoyle",
    type: "mechanics",
    tags: ["Blood & Bone","Kind"],
    content: `# B&B — Gargoyle

Stress triggers below are +1 each, once a scene each (key = the trigger's name). XP triggers pay once a session. Use the sheet's numbers; the Beast steps are already-true changes to narrate.

## The Kind
Monstrous physical specimens forced into isolation. They possess terrifying strength and wings, but their grotesque appearance shatters the masquerade.

- **Stress Escalation:** Increases when exposed to mortals, when their disguise slips, or when the sun begins to rise.
- **Recover Move: Sate the Beast** – Requires claiming absolute dominion over a hidden territory or terrifying a mortal into silence.
- **Progression Triggers (XP):** 1 XP for navigating a mortal space completely undetected; 3 XP for establishing a new, perfectly secure haven; 5 XP for eliminating a direct threat to their secrecy.
- **Sunlight Mechanic (Stone Slumber):** If caught in sunlight, Gargoyles instantly turn to stone. They are impervious to environmental hazards but entirely helpless against targeted destruction.
- **Weakness:** Stone Slumber is involuntary and total. Once sunlight triggers it, a Gargoyle has zero agency until nightfall — no rolls, no reactions, no defense. Anyone who knows their location during the day has a free window to destroy them.

## Archetypes
**The Warden** — *Protects a hidden community without violence.*
- Sate the Beast via protecting territory: strong hit also removes one point of Stress from an ally's meter, if present.
- Terrorizing a mortal into silence no longer satisfies your Beast — only genuine protection does.
- **Archetype XP:** 1 XP for shielding a mortal from harm without being seen; 3 XP for resolving a threat to your community without violence; 5 XP for revealing yourself to someone you protect, and being accepted.
- **Alternate XP:** 1 XP for learning something personal about a mortal you protect; 3 XP for turning away another supernatural threat from your community; 5 XP for expanding your protection to somewhere new and holding it.
- **Stress Relief:** watching over your community through a full night undisturbed; repairing or improving something in your territory with your own hands; a mortal you protect being visibly, unknowingly safe.

**The Tyrant** — *Rules through fear and violent reputation.*
- Terrorizing mortals is more effective: strong hit on Sate the Beast this way decreases Stress by 3.
- Mortals who've encountered you are an additional Stress Escalation trigger when they resurface — your reputation follows you.
- **Archetype XP:** 1 XP for a mortal obeying you purely on reputation, before you act; 3 XP for claiming territory from a rival through fear alone; 5 XP for breaking a faction's will without a single killing.
- **Alternate XP:** 1 XP for a new rumor about you spreading without your involvement; 3 XP for a rival abandoning a claim rather than test you; 5 XP for a mortal institution — police, press, a landlord — quietly working around you.
- **Stress Relief:** a rival visibly deferring to you; walking your territory unchallenged; destroying something that belonged to someone who defied you.

## Beast Meter track — The Stone
1. Your skin roughens permanently. Long sleeves stop being optional.
2. You wake standing, in postures you don't remember taking.
3. **(First Crack)** Fine motor control fails you. Small, human tasks — buttons, handwriting — become impossible.
4. You stop being able to speak above a low grind. Conversation becomes effortful for everyone.
5. Your territory feels like the only real place. Everywhere else is a kind of static.
6. **(Slipping)** You lose the instinct to hide. You have to consciously remember to conceal yourself.
7. Stone Slumber begins claiming you before dawn, unpredictably, without full sunlight.
8. You no longer recognize your own face in photographs from before.
9. **(Last Warning)** You've begun sleeping through nights as well as days. Waking is now the exception.
10. **(Control)** You do not wake again as yourself. Something ancient is using the shape you left behind.

## Powers
### Kind Powers

**STONE SKIN**
1. Mundane weapons cause you far less harm than they should. Ignore the "take a hit" cost on a weak hit during a Skirmish once per fight.
2. When you Face Danger by simply enduring physical punishment rather than avoiding it, add +2.
3. You no longer suffer lingering injuries from mundane sources at all. Only supernatural harm and sunlight leave lasting marks.

**WINGS**
1. You can glide from height and cross rooftop gaps silently. Landing quietly requires care in populated areas. Falls from height never harm you, and a weak hit on Face Danger to cross a gap or drop costs you nothing.
2. You can achieve genuine powered flight for short bursts. When you Slip Away by taking to the air, add +2.
3. You can carry another person in flight, and travel across a city in a single night without touching the ground. When you Undertake a Journey by air, add +2.

**TERRITORIAL SENSE**
1. Within territory you've claimed, you always know how many people are present and roughly where. When you Gather Information about who is there, add +1.
2. Within your territory, add +1 to all Face Danger and Secure an Advantage rolls.
3. You know instantly when your territory is entered by anything supernatural, and can identify its Kind. Add +1 to your first roll against it.

**THE GARGOYLE'S STILLNESS**
1. When you hold perfectly still against stone, brick, or statuary, mortals do not notice you. No roll required. When you Gather Information by watching from stillness, add +1.
2. You can maintain this stillness for hours without strain, and observe everything happening around you. When you Secure an Advantage from stillness, add +1.
3. You can enter Stone Slumber voluntarily, at will, and wake from it at a time you choose beforehand. Your first roll after waking this way is at +1.

**RENDING STRENGTH**
1. You can tear through mundane barriers — doors, fences, sheet metal — without a roll.
2. When you Face Danger or Secure an Advantage through raw physical force, add +2.
3. You can lift and throw objects no mortal could move. In a Skirmish, you may use the environment itself as a weapon for an automatic +1 Advantage on one roll.

**THE MASON'S EYE**
1. You instantly understand a structure's layout, load points, and hidden spaces on entering it. When you Slip Away inside it, add +1.
2. When you Gather Information about a building or Secure an Advantage using its architecture, add +2.
3. You can bring down a structure, or a critical part of one, deliberately and precisely. Add +1 to the roll. Doing so raises your Stress by 1.

### Warden Powers

**THE SHELTERING WING**
1. When you interpose yourself between a threat and someone under your protection, add +2 to the roll.
2. You may take a cost or consequence that would fall on someone you protect, absorbing it yourself.
3. Once per session, declare that someone under your protection was simply never in danger — you'd already handled it, off-screen. The GM narrates what it cost you.

**THE QUIET WORD**
1. You can turn a mortal away from a place or a person without violence or terror. Roll +Heart instead of +Shadow.
2. Mortals you've turned away this way don't develop a fear of you, and can be turned away again later. Add +1 when you do.
3. You can defuse a violent situation entirely without revealing what you are. Once per session, end a Skirmish before the first roll.

### Tyrant Powers

**THE REPUTATION**
1. When you Compel someone who has heard of you, add +2.
2. Mortals in your territory who resist you find no help — others are too afraid to intervene. Ignore the "witnesses" complication on a weak hit.
3. Once per session, an enemy simply withdraws rather than face you. The GM decides what they take with them on the way out.

**DOMINION**
1. You may claim territory by force. Sate the Beast this way decreases Stress by 3 on a strong hit.
2. Anyone entering your claimed territory who knows what you are must Face Danger or lose their nerve.
3. You can hold a territory larger than any one Gargoyle should manage — a district, a quarter — and add +1 to Compel anyone in it, but every rival in the city now knows exactly where to find you.`,
  },
  {
    id: "builtin:blood-and-bone:wendigo",
    title: "B&B — Wendigo",
    type: "mechanics",
    tags: ["Blood & Bone","Kind"],
    content: `# B&B — Wendigo

Stress triggers below are +1 each, once a scene each (key = the trigger's name). XP triggers pay once a session. Use the sheet's numbers; the Beast steps are already-true changes to narrate.

## The Kind
Once human, now driven by a traumatic, cannibalistic curse. They can pass perfectly as human — but only as long as they are well-fed on human flesh.

- **Stress Escalation:** Increases when exposed to extreme cold, when witnessing mortal vulnerability, or when starving.
- **Recover Move: Sate the Beast** – Requires consuming human flesh.
- **Progression Triggers (XP):** 1 XP for consuming preserved/scavenged human flesh; 3 XP for hunting and consuming a living human; 5 XP for consuming another supernatural creature.
- **The Slipping Mask (meter, 0-3):** 0 steady, 1 strained, 2 cracking (anyone who looks closely sees something wrong), 3 slipped (the human face is gone). It rises by 1 at the dawn of every night with no feed (after end_session, adjust Slipping Mask by 1). A Sate the Beast hit, strong or weak, sets it to 0.
- **Weakness:** The hunger only grows. "Starving" is a Stress trigger (+1, key "starving") that fires at the third foodless dawn in a row while Beast is 0-2, at the second while Beast is 3-5, and at every foodless dawn from Beast 6. The deeper the Beast, the sooner it bites. There is no equilibrium, only a slower or faster slide.

## Archetypes
**The Graverobber** — *Feeds on the already-dead, refusing to kill.*
- Consuming scavenged/preserved flesh decreases Stress by 2 on a strong hit (rather than the lesser feed it would otherwise be) — but the Slipping Mask rises by 2, not 1, at each foodless dawn, since it is a weaker feed.
- Never triggers Stress from "witnessing mortal vulnerability" — you've made peace with death, not violence.
- **Archetype XP:** 1 XP for securing a feed from the already-dead without detection; 3 XP for building or protecting a reliable supply of scavenged flesh; 5 XP for holding to your rule through a starvation that nearly killed you.
- **Alternate XP:** 1 XP for establishing a new source for scavenged flesh; 3 XP for keeping your rule secret from someone who'd use it against you; 5 XP for convincing another Wendigo to try your way.
- **Stress Relief:** restocking your stores to full; visiting a grave or memorial and paying respect to what you take; confessing what you are to someone who doesn't recoil.

**The Predator** — *Actively stalks and kills living prey.*
- Killing living prey decreases Stress by 2 and sets the Slipping Mask to 0; the next dawn does not advance it.
- Extreme cold is a +2 Stress trigger for you, not +1 (once a scene) — the curse recognizes you've leaned into it.
- **Archetype XP:** 1 XP for a hunt that leaves no trace behind; 3 XP for taking prey from another predator's territory; 5 XP for hunting something that was hunting you.
- **Alternate XP:** 1 XP for choosing prey by a standard of your own rather than convenience; 3 XP for a hunt that required genuine patience — days, not hours; 5 XP for hunting in territory that belonged to someone else and walking away uncontested.
- **Stress Relief:** a hunt that ends exactly as you planned it; running down something faster or stronger than you; a night spent in deep cold with nothing hunting you back.

## Beast Meter track — The Hollow
1. You stop tasting ordinary food. It registers as texture and nothing else.
2. Your teeth loosen and reset, sharper. You get used to it.
3. **(First Crack)** You lose weight that never comes back, no matter how much you consume.
4. The cold stops registering as cold. It registers as *comfortable*.
5. You start hearing your own voice in the mouths of others when you're hungry.
6. **(Slipping)** The Mask requires conscious effort now, even well-fed. You maintain it like holding your breath.
7. You can no longer remember what your original face looked like without a photograph.
8. You begin measuring people by what they'd provide. It happens before you can stop it.
9. **(Last Warning)** Your body no longer processes anything but human flesh. Everything else passes through you.
10. **(Control)** It walks out into the cold and it does not come back with your name.

## Powers
### Kind Powers

**THE PERFECT MASK**
1. While well-fed, your human appearance withstands close scrutiny — medical examination, photographs, mirrors. When you Face Danger to pass as human under scrutiny, add +1.
2. When you Compel or Gather Information while wearing your human face, add +1.
3. You can alter your human appearance between feedings, taking on a different face entirely. Anyone hunting your old face must Face Danger to find you, and you add +1 to Slip Away from them. Doing so raises your Stress by 1.

**FROSTBOUND**
1. You are unaffected by cold, exposure, and winter conditions of any severity. Add +1 when you Face Danger in them.
2. You can move through deep snow, ice, and frozen terrain without impediment or trace. Add +1 when you Slip Away in cold conditions.
3. Your presence chills the air around you. Mortals nearby grow uneasy, sluggish, and slow to act: add +1 to your first Action Roll in a Skirmish against them.

**THE HUNGER'S EDGE**
1. When your Stress is 4 or higher, add +1 to all Bone rolls.
2. When your Stress is 5 or higher, add +1 to Nerve rolls as well.
3. At Stress 6, before triggering the Time Skip, you may act once at full monstrous capacity — an automatic strong hit on any single roll. Then the Time Skip proceeds as normal.

**SCENT OF THE DYING**
1. You can sense mortally wounded, dying, or recently dead people within roughly a city block. When you Secure an Advantage on one of them, add +1.
2. When you Gather Information about a death — how, when, by whom — add +2.
3. You know, on meeting someone, roughly how close they are to death. This includes deaths that haven't happened yet but are already in motion. Add +1 to Compel anyone whose death you sense is near.

**THE LONG STRIDE**
1. You can travel on foot faster and longer than any human, without rest. When you Undertake a Journey on foot, add +1.
2. You can cover distances overnight that should take days. Add +2 when you Slip Away across open country.
3. You always arrive somewhere sooner than anyone expects you to. Once per session, declare you're already there.

**THE VOICE IN THE TREES**
1. You can mimic voices you've heard — perfectly, including people you've eaten. When you Compel or deceive someone with a voice you've mimicked, add +1.
2. You can draw a person away from safety and toward you using a voice they trust. Roll +Shadow to Compel.
3. You can call to a group, and at least one of them will come. They won't be able to explain why afterward, if they get the chance. Add +1 to your next roll against whoever comes.

### Graverobber Powers

**THE COLD LARDER**
1. You maintain a hidden supply of preserved flesh. You always have a feed available unless the fiction has taken it from you. When you Sate the Beast from it, add +1.
2. Your supply is well enough hidden that finding it requires deliberate, informed searching. Feeding from it never attracts attention: ignore a witnesses or discovery complication on a weak hit.
3. Once per session, your stores let you skip a hunt entirely: reduce Stress by 2 with no roll, and no complication.

**GRAVE-SIGHT**
1. You can sense buried and concealed bodies within a wide radius, and how long they've lain there. When you Secure an Advantage using what you know of where bodies lie, add +1.
2. When you Gather Information at a burial site, a morgue, or a place of mass death, add +2.
3. You can tell how someone died by proximity to their remains alone, including whether another Kind was involved. Add +1 to your next roll against whoever did it.

### Predator Powers

**THE STALK**
1. When you Secure an Advantage by stalking prey before a hunt, add +2.
2. Prey you've stalked cannot successfully Slip Away from you on their first attempt.
3. Once per session, begin a Skirmish against stalked prey already at +1 Advantage.

**THE KILLING COLD**
1. Your kills leave no evidence of anything but exposure. Mortal investigators find nothing supernatural. Ignore a witnesses or evidence complication on a weak hit when you kill.
2. Killing living prey decreases your Stress by 3 instead of 2.
3. You can freeze a victim in place with a touch — not killing them, but leaving them unable to run, call out, or resist. They cannot Slip Away, and you add +1 to Sate the Beast on them.`,
  },
  {
    id: "builtin:blood-and-bone:werewolf",
    title: "B&B — Werewolf",
    type: "mechanics",
    tags: ["Blood & Bone","Kind"],
    content: `# B&B — Werewolf

Stress triggers below are +1 each, once a scene each (key = the trigger's name). XP triggers pay once a session. Use the sheet's numbers; the Beast steps are already-true changes to narrate.

## The Kind
Bound to the moon and their own rage, werewolves fight for dominance as much as survival. Pack is everything — a lone wolf is a dying wolf.

- **Stress Escalation:** Increases when isolated from the pack, when challenged for dominance, or as the moon waxes toward full.
- **Recover Move: Sate the Beast** – Requires a physical release of dominance: winning a fight, a hunt, or a challenge within the pack hierarchy.
- **Progression Triggers (XP):** 1 XP for defending pack territory or a packmate; 3 XP for winning a dominance challenge; 5 XP for successfully leading the pack through a crisis.
- **The Moon's Pull:** On the night of the full moon, all Stress Escalation triggers apply automatically, regardless of circumstance. Resisting the Change that night is a roll +Heart (B&B — Moves); on a miss, you turn involuntarily.
- **Weakness:** Silver wounds cannot be healed by supernatural recovery — only time and mundane medicine close them, and they scar permanently.

## Archetypes
**The Packbound** — *Finds identity and stability entirely through the pack.*
- +1 to any roll made in direct defense of the pack or a packmate.
- Isolation from the pack triggers Stress escalation immediately, not gradually.
- **Archetype XP:** 1 XP for putting a packmate's needs above your own at real cost; 3 XP for holding the pack together through a fracture that should have broken it; 5 XP for saving the pack at the price of your own standing within it.
- **Alternate XP:** 1 XP for resolving a conflict between two packmates; 3 XP for bringing someone new into the pack successfully; 5 XP for the pack surviving a loss that should have scattered it.
- **Stress Relief:** a night spent with the pack doing nothing important; being touched, groomed, or physically close to a packmate; hearing a packmate acknowledge your place out loud.

**The Rogue** — *Self-exiled or cast out, surviving alone.*
- Immune to the "isolated from pack" Stress trigger — you've already made peace with being alone.
- Dominance challenges are harder for you to walk away from: a miss on Sate the Beast during one always adds a complication from your Doomed burden (a rival now hunts you specifically).
- **Archetype XP:** 1 XP for surviving a full moon alone without harming anyone; 3 XP for beating a pack-backed rival with no support of your own; 5 XP for building something lasting — a haven, an alliance, a reputation — entirely without a pack.
- **Alternate XP:** 1 XP for refusing an offer to join a pack; 3 XP for being useful to a pack without belonging to it; 5 XP for another Rogue seeking you out for help.
- **Stress Relief:** a night with genuine solitude and no threats; marking new ground as your own; beating a challenger without any help arriving.

## Beast Meter track — The Wild
1. Your senses sharpen past comfort. Cities become overwhelming, constantly.
2. Your temper shortens permanently. People start managing you.
3. **(First Crack)** You lose the ability to sit still. Enclosed spaces become genuinely unbearable.
4. Your eyes stop changing back completely. People notice and look away.
5. You begin to think in terms of hierarchy in every room, without meaning to.
6. **(Slipping)** Partial transformation happens involuntarily under stress. Claws, jaw, posture.
7. You dream as the wolf and wake disappointed to be human.
8. You've started marking territory — doorways, thresholds — without conscious decision.
9. **(Last Warning)** You can no longer hold human shape for a full day. The change comes when it wants.
10. **(Control)** There is no man left to come back. There is only the thing that runs.

## Powers
### Kind Powers

**THE PACK BOND**
1. You always know the rough direction and condition of your packmates. When you Undertake a Journey to reach one, add +1.
2. When you aid a packmate, they add +1 to their roll rather than the usual bonus.
3. You can share sensation with a packmate at a distance — see what they see, hear what they hear — for a short time. When you Gather Information through their senses, add +1.

**THE CHANGE**
1. You can transform at will outside the full moon. While transformed, add +1 to Face Danger and to your first Action Roll in a Skirmish. Transforming raises your Stress by 1.
2. You can transform partially — claws, jaw, eyes — without committing to the full change, and without the Stress cost. While partly changed, add +1 to Gather Information by your senses or to Face Danger with claws.
3. Your transformation is fast enough to happen mid-action. You may transform as part of any move, including during a Skirmish.

**HUNTER'S NOSE**
1. You can track a person or creature by scent across a city, through crowds, and over days. Ignore the cost of a weak hit when you Undertake a Journey following a trail.
2. When you Gather Information by scent, add +2. You can smell lies — fear, adrenaline, and the physical tells of deception.
3. You can follow a trail even through water, weather, or deliberate masking, ignoring any penalty they impose, and know if the trail has been laid deliberately to mislead you.

**ALPHA'S VOICE**
1. When you Compel another supernatural creature through sheer dominance, roll +Bone.
2. On a strong hit compelling this way, the target treats you as higher in the hierarchy until they find a reason not to. Add +1 to your next Compel on them.
3. You can issue a command to a group and be obeyed instinctively before anyone thinks to question it. Add +1 to the roll. Doing so raises your Stress by 1.

**REGENERATION**
1. Wounds close within hours rather than weeks. You recover from mundane injury between scenes, and ignore the cost of a weak hit that is only mundane injury.
2. When you Face Defeat from physical harm, add +2.
3. You can regrow what's been taken from you, given time, and ignore the cost of a weak hit on Face Defeat from losing a limb or organ. Silver wounds remain the exception — those stay, and they scar.

**THE MOON'S GIFT**
1. On the night of the full moon, add +1 to all rolls made while transformed.
2. You retain full clarity and control of yourself while transformed on the full moon. A miss on Resisting the Change counts as a weak hit.
3. On the full moon, treat your Stress as 0 for the purpose of all Powers and penalties, regardless of its actual value.

### Packbound Powers

**THE CIRCLE**
1. When acting in the presence of a packmate, add +1 to any roll.
2. When two or more packmates are present, that bonus becomes +2.
3. Once per session, the pack takes a consequence for you — the cost lands on them instead. Decrease one Connection's rank.

**SHARED BREATH**
1. You may transfer 1 point of Stress from a packmate to yourself.
2. You may take on a packmate's injury or lasting condition in their place.
3. Once per session, when a packmate would lose control to their beast, you may hold them steady — no roll, no Time Skip. Raise your own Stress by 2.

### Rogue Powers

**THE LONE ROAD**
1. When you act with no allies present, add +1 to any roll.
2. You can disappear from a city entirely and resurface elsewhere with no trail. Add +2 to Slip Away when leaving a place for good.
3. Once per session, when you would suffer a consequence that requires allies to recover from, ignore it. You've done this before, alone.

**TERRITORY OF ONE**
1. You can claim temporary territory anywhere, and Sate the Beast within it as though it were established. Add +1 to Sate the Beast there.
2. Other Werewolves entering your claimed ground know instantly that it's taken, and by whom. Add +1 to Compel them there.
3. You can hold ground against a full pack. Once per session, a pack-backed challenge against you simply fails before it begins.`,
  },
  {
    id: "builtin:blood-and-bone:witch-warlock",
    title: "B&B — Witch/Warlock",
    type: "mechanics",
    tags: ["Blood & Bone","Kind"],
    content: `# B&B — Witch/Warlock

Stress triggers below are +1 each, once a scene each (key = the trigger's name). XP triggers pay once a session. Use the sheet's numbers; the Beast steps are already-true changes to narrate.

## The Kind
Once mortal, now bound to power that was never meant for human hands. Magic exacts a price for every favor, and the debt always comes due.

- **Stress Escalation:** Increases when a working goes wrong, when the source of their power grows displeased, or when they're cut off from their tools (grimoire, coven, sacred space).
- **Recover Move: Sate the Beast** – Requires performing a ritual sacrifice — of blood, of a possession, or of someone else's secret.
- **Progression Triggers (XP):** 1 XP for successfully casting a working beyond their normal limits; 3 XP for binding a new source of power (a spirit, a pact, a relic); 5 XP for breaking or renegotiating a pact that should have been unbreakable.
- **The Ledger (meter, 0-10):** every working that says "add N marks" raises it by N (adjust Ledger by N). A Sate the Beast ritual costs 1 mark for the first ritual of the night and +1 more for each further ritual that night (1, then 2, then 3). At 10 the source makes its demand: you set it, and no working that costs marks is possible until it is met. Meeting it drops the Ledger to 5 (to 0 with The Clean Slate).
- **Weakness:** Their power is tied to a physical anchor (grimoire, familiar, working circle). Destroy or steal it, and the witch is reduced to a mortal until it's recovered.

## Archetypes
**The Hedge Witch** — *Practices small, careful magic, avoiding large pacts.*
- Your Ledger fills slower — a Sate the Beast ritual always costs 1 mark, never escalating.
- Workings beyond your normal limits are harder: -1 to rolls attempting them.
- **Archetype XP:** 1 XP for solving a problem with small magic that others would have needed a pact for; 3 XP for refusing an offer of greater power; 5 XP for undoing damage caused by someone else's reckless working.
- **Alternate XP:** 1 XP for helping a mortal with something small and mundane; 3 XP for teaching restraint to someone chasing power; 5 XP for surviving direct pressure from a greater power without conceding anything.
- **Stress Relief:** a working done purely for someone else's benefit; a full night of study with no magic performed; tending your tools, garden, or workspace properly.

**The Servant** — *Chases power through increasingly reckless pacts.*
- Binding new sources of power (3 XP trigger) also grants an immediate +1 add to your next roll using that power.
- Your Sate the Beast rituals start at 2 marks and escalate (2, then 3, then 4 in a night); when the Ledger fills, the demand is guaranteed severe.
- **Archetype XP:** 1 XP for successfully meeting a demand from your power's source; 3 XP for extracting more from a pact than its terms should allow; 5 XP for surviving a full Ledger without losing anything you couldn't replace.
- **Alternate XP:** 1 XP for learning something new about what you're actually bound to; 3 XP for using your source's power to help someone other than yourself; 5 XP for making a second source want you, and choosing between them.
- **Stress Relief:** a demand from your source met promptly and fully; using borrowed power successfully and visibly; being recognized by another practitioner as something greater than they are.

## Beast Meter track — The Debt
1. Your handwriting changes. It isn't yours anymore, and it's more legible.
2. You stop needing to consult your notes. The workings are simply *in* you now.
3. **(First Crack)** Something has taken a memory as payment. A person, a year, a place — gone cleanly.
4. Your reflection lags behind you, very slightly, in the corner of your eye.
5. Mortals find your presence uncomfortable and can't articulate why.
6. **(Slipping)** You speak in your source's cadence when tired. Others hear it before you do.
7. Small workings happen around you without being cast — doors, flames, weather.
8. You've stopped being able to lie about what you serve. The truth surfaces.
9. **(Last Warning)** It answers questions put to you, occasionally, using your mouth.
10. **(Control)** The pact completes. What walks away has your knowledge, your face, and none of your intentions.

## Powers
### Kind Powers

**WARDING**
1. You can lay a ward on a doorway or small space that turns away mortal attention. It holds for a night. When you hide or Slip Away behind it, add +1.
2. Your wards can bar a specific Kind. Something warded against must Face Danger to cross, and suffers a cost even on a hit.
3. You can ward a space permanently, so long as you renew it monthly. Add 1 mark to your Ledger each renewal. You know who crosses it, and add +1 to your first roll against them.

**THE FAMILIAR**
1. You have a familiar — an animal, an object, a small bound spirit. It can carry messages, observe, and retrieve small items. When it Aids Another on your roll, add +1.
2. Your familiar can act independently and report back. When you Gather Information through your familiar, add +2.
3. You can see and speak through your familiar at any distance, and add +1 to Secure an Advantage through it. If it is destroyed, you take a Stress spike (+2) and lose this Power until you bind another.

**THE READING**
1. Touching an object shows you a flash of its recent history — who held it, and roughly when. When you Gather Information that way, add +1.
2. You can read a place rather than an object, sensing significant events that happened there. When you Gather Information that way, add +1.
3. You can read a person by touch, learning a secret they're actively concealing, and add +2 to that Gather Information roll. Doing so adds 1 mark to your Ledger.

**THE BORROWED WORD**
1. Once per session, you may add +2 to any roll by calling on your power's source. Add 1 mark to your Ledger.
2. Once per session, you may turn a miss into a weak hit by the same means. Add 2 marks to your Ledger.
3. Once per session, you may turn a weak hit into a strong hit. Add 3 marks to your Ledger. Your source will remember this.

**THE BINDING**
1. You can bind a minor spirit or supernatural presence into an object for a night, and add +1 to one roll using it. Add 1 mark to your Ledger.
2. You can bind something significant — a Ghost, a lesser power — into a vessel, holding it as long as the vessel is intact. It Aids Another on your rolls in the vessel's presence (add +1).
3. You can bind a creature of any Kind, briefly, in place, and add +2 to any roll against it while it is bound. Doing so adds 3 marks to your Ledger and makes a permanent enemy.

**THE HEXING HAND**
1. You may curse a person you've touched or taken something from. They suffer -1 on rolls related to a domain you name, until it's lifted.
2. Your curses can be laid at a distance, given something personal of theirs, at -2 instead of -1. Add 1 mark to your Ledger.
3. You can lay a curse that escalates over time, growing worse until it's addressed. Add 2 marks to your Ledger. Curses this heavy tend to find their way back.

### Hedge Witch Powers

**THE KITCHEN CRAFT**
1. You can produce minor workings — healing, warding, luck, sleep — from ordinary materials, with no Ledger cost, and add +1 to any roll using them.
2. Your small workings affect others as easily as yourself. Once per session, remove 1 Stress from someone else.
3. Once per session, solve a problem entirely with small magic that should have required a major working. No Ledger marks.

**THE CLEAN SLATE**
1. Your Ledger clears fully whenever you meet a demand from your source, rather than partially.
2. When your Ledger fills, you may make a roll +Wits to renegotiate the demand rather than simply accepting it.
3. Once per session, erase 2 marks from your Ledger through a night of careful, patient work.

### Servant Powers

**THE DEEPER PACT**
1. Choose a domain your source holds power over. Add +1 to all rolls within that domain.
2. Your source will act on your behalf unprompted, once per session, in ways you don't control.
3. You may call on your source for something enormous — a genuine act of power. Add +2 to the roll. Add 5 marks to your Ledger, and the GM tells you what it wants in return.

**THE SECOND VOICE**
1. Your source speaks to you directly. Once per session, ask it a question; the GM answers, truthfully but not helpfully. Add +1 to your next roll acting on the answer.
2. You can let it speak through you. Add +2 to Compel, but the target will remember something was wrong with your voice.
3. You may surrender control to your source entirely for a scene. Whatever it accomplishes, it accomplishes. Raise your Stress by 2 afterward.`,
  },
  {
    id: "builtin:blood-and-bone:hunter",
    title: "B&B — Hunter",
    type: "mechanics",
    tags: ["Blood & Bone","Kind"],
    content: `# B&B — Hunter

Stress triggers below are +1 each, once a scene each (key = the trigger's name). XP triggers pay once a session. Use the sheet's numbers; the Beast steps are already-true changes to narrate.

## The Kind
Not a monster — the thing that hunts monsters. No claws, no fangs, just training, grit, and a growing certainty that the line between predator and prey is thinner than they'd like.

- **Stress Escalation:** Increases when a hunt goes wrong, when they're forced to work with (or spare) a monster, or when they see how close they've come to becoming what they hunt.
- **Recover Move: Steel the Resolve** – Requires confiding in a trusted ally, returning to a place of safety, or completing a hunt clean. Roll +Heart (if leaning on connection) or +Wits (if leaning on discipline/routine).
  - Strong hit: decrease Stress by 2.
  - Weak hit: decrease Stress by 1, but an old wound (physical or otherwise) resurfaces.
  - Miss: your resolve cracks. Pay the Price.
- **Progression Triggers (XP):** 1 XP for successfully identifying and confirming a monster's Kind before engaging; 3 XP for taking down a supernatural threat without civilian casualties; 5 XP for showing mercy to a monster at real personal cost.
- **The Growing Doubt:** Hunters don't lose control to a beast — they lose control to despair and moral erosion. When Stress caps at 6, they don't transform; they break. (This is what Surrender to the Years already covers for them.)
- **Weakness:** No supernatural healing, no Sate the Beast shortcut. A Hunter's only recovery tools are mundane — time, medicine, and other people. This makes them fragile, but also means nothing can be taken from them the way a source of power can be taken from a Witch or a pack from a Werewolf.

## Archetypes
**The Zealot** — *A black-and-white crusader who sees monsters as monsters, full stop.*
- +1 to Steel the Resolve when it follows completing a hunt "clean" (no mercy shown).
- Showing mercy to a monster (5 XP trigger) instead costs you 1 Stress immediately, even though you still earn the XP — your convictions push back.
- **Archetype XP:** 1 XP for completing a hunt exactly to doctrine, no deviations; 3 XP for holding to your convictions when someone you trust argued against them; 5 XP for eliminating a threat every other hunter had written off as impossible.
- **Alternate XP:** 1 XP for warning a mortal away from something they didn't understand; 3 XP for recruiting or training someone new to the Vigil; 5 XP for exposing a monster that had successfully passed as human for years.
- **Stress Relief:** maintaining or cleaning your kit in full; a hunt that ended exactly according to doctrine; time spent among mortals who are safe because of you.

**The Pragmatist** — *Willing to work alongside monsters when it serves the greater good.*
- Can call on a monstrous Connection for aid using Steel the Resolve's +Heart option, something other Hunters can't do.
- Working with monsters no longer triggers Stress escalation on its own — only genuine betrayal or harm does.
- **Archetype XP:** 1 XP for gaining useful information from a monster rather than a weapon; 3 XP for an alliance with a monster that saves mortal lives; 5 XP for changing another hunter's mind about where the line actually falls.
- **Alternate XP:** 1 XP for keeping a monstrous ally's secret when it would have been easier not to; 3 XP for resolving a supernatural conflict without any deaths on either side; 5 XP for brokering a truce that holds.
- **Stress Relief:** an honest conversation with a monstrous Connection; a night where the threat resolved and nobody died; being trusted by someone who had no reason to trust you.

## Beast Meter track — The Erosion
1. You stop being able to talk about your work with anyone outside it.
2. Sleep becomes unreliable. You start working the hours you can't sleep through.
3. **(First Crack)** You've lost a relationship you can't get back, and you're relieved.
4. You begin categorizing strangers by threat before you notice their faces.
5. Violence stops producing an adrenaline response. It's just a task now.
6. **(Slipping)** You can't remember why you started. You know the reason existed.
7. You start taking risks that read, to others, as wanting it to end.
8. You've begun making decisions other hunters won't defend, and you no longer explain them.
9. **(Last Warning)** You've done something you would once have hunted someone else for.
10. **(Control)** You don't become a monster. You become the thing that keeps killing after the reason is gone — and someone else will have to stop you.

## Powers
### Kind Powers

**THE FIELD KIT**
1. You have a prepared kit of counter-supernatural gear. Once per session, declare you brought exactly the right tool for a situation, and add +1 to the roll that uses it.
2. Your kit includes Kind-specific countermeasures. When you Secure an Advantage against a Kind you've correctly identified, add +2.
3. Once per session, your kit lets you neutralize a Kind's signature ability outright for a single scene — silver bindings, UV flood, a warded circle.

**MONSTER LORE**
1. When you Gather Information about a supernatural creature, add +1.
2. On a strong hit identifying a creature's Kind, you also learn its specific Weakness as written in Chapter 2. Add +1 to your next roll exploiting it.
3. You can identify an individual creature's Archetype and likely Stress state from behavior alone. Add +1 to your next Secure an Advantage against it.

**STEADY HANDS**
1. When you Face Danger against something that should terrify you, add +1.
2. Supernatural fear effects, dominance, and compulsion have no automatic hold on you — you always get a roll to resist, and add +1 to it.
3. Once per session, when you would take a Stress increase from horror, revulsion, or moral injury, you may ignore it entirely.

**THE NETWORK**
1. You have contacts in one city who can provide shelter, information, or a clean exit. When you Slip Away through them, add +1.
2. Your contacts extend across the Vigil. When you Gather Information through the network, add +2.
3. Once per session, you may call in the network for direct support — a distraction, an extraction, a second pair of hands at the worst moment.

**THE SAFEHOUSE**
1. You maintain a warded, stocked safehouse. Steel the Resolve there and add +2.
2. Your safehouse is genuinely secure — finding it requires a dedicated, informed effort by someone who already knows you exist. When you Slip Away to reach it, add +1.
3. You maintain safehouses in multiple cities. Once per session, declare you have one wherever you currently are.

**THE HARD-WON SCAR**
1. Choose a Kind that has hurt you badly. Add +1 to all rolls against that Kind.
2. You recognize that Kind's tactics instantly. They cannot ambush or surprise you.
3. Once per session, when facing that Kind, turn a miss into a weak hit. You've seen this exact thing go wrong before.

### Zealot Powers

**THE UNBROKEN OATH**
1. When acting in direct service of your Vow, add +1 to any roll.
2. Your conviction is genuinely armor. Supernatural compulsion cannot affect you at all.
3. Once per session, when you would take Stress from doubt, moral injury, or horror, ignore it entirely — your certainty holds.

**THE CLEAN KILL**
1. When you engage a confirmed monster with lethal intent, add +1 to all three Skirmish rolls.
2. On a Decisive Victory against a monster, ignore all costs accumulated from weak hits.
3. Once per session, end a monster's threat in a single stroke — no Skirmish, no rolls. The GM narrates what witnessing it cost you.

### Pragmatist Powers

**THE UNEASY ALLIANCE**
1. You may hold Connections with supernatural creatures at Steady or Strong rank, which most hunters cannot. When you call on one for aid, add +1.
2. When you Compel a monster by offering a genuine trade rather than a threat, add +2.
3. Once per session, call on a monstrous Connection for aid in a way no other hunter could arrange. Their price comes later.

**THE OTHER OPTION**
1. When you resolve a supernatural threat without killing, decrease your Stress by 1.
2. You can offer terms mid-Skirmish. Once per fight, roll +Heart to end it in a bargain rather than a victory.
3. Once per session, spare a monster and gain something lasting for it — information, an ally, a debt owed. The GM decides which.`,
  },
  {
    id: "builtin:blood-and-bone:ghost",
    title: "B&B — Ghost",
    type: "mechanics",
    tags: ["Blood & Bone","Kind"],
    content: `# B&B — Ghost

Stress triggers below are +1 each, once a scene each (key = the trigger's name). XP triggers pay once a session. Use the sheet's numbers; the Beast steps are already-true changes to narrate.

## The Kind
Death didn't take. Something kept you tethered — unfinished business, a violent end, a promise unkept — and now you drift through a world that can barely see you, growing less human with every year you refuse to let go.

- **Stress Escalation:** Increases when confronted with the manner of their death, when their tether is threatened or ignored, or when they're forced to interact with the living world directly (crossing running water, entering hallowed ground, physical contact).
- **Recover Move: Sate the Beast** – Requires reinforcing the tether: revisiting the site of death, interacting with the person/object/unfinished business that binds them, or draining warmth/life force from something living.
- **Progression Triggers (XP):** 1 XP for influencing the living world without revealing yourself; 3 XP for advancing your unfinished business in a meaningful way; 5 XP for resolving — or permanently securing — your tether.
- **The Fading:** A Ghost who goes too long without reinforcing their tether begins to lose cohesion — memories, form, even sense of self. The Fading begins at Stress 4 (5 for the Anchored, 3 for the Unraveling). While your Stress is at or above that threshold, choose one: a stat counts as 0 for your rolls, or a Connection cannot be called on, until Stress drops below it.
- **Weakness:** A Ghost's tether is a specific, discoverable thing. Anyone who identifies and destroys, resolves, or claims it can force the Ghost to move on — permanently removing them from play — without ever needing to fight them.

## Archetypes
**The Anchored** — *Stable in their tether, still trying to help the living.*
- The Fading begins at Stress 5 instead of 4 — you hold together longer.
- Influencing the living world without revealing yourself (1 XP trigger) is easier: +1 to the roll.
- **Archetype XP:** 1 XP for helping a living person who never learns you exist; 3 XP for guiding another spirit toward resolution; 5 XP for protecting your tether's subject from serious harm.
- **Alternate XP:** 1 XP for a living person acknowledging your presence willingly; 3 XP for preventing another spirit from harming the living; 5 XP for the person you protect finding real safety or peace.
- **Stress Relief:** time spent at your tether without threat or urgency; witnessing the person you protect happy and unaware; helping a living person in a way they notice, even if they don't understand.

**The Unraveling** — *Losing their grip, drifting toward predation.*
- Draining warmth/life force from the living decreases Stress by 3 on a strong hit (instead of 2).
- The Fading begins at Stress 3 instead of 4 — you're burning yourself out faster in exchange for power.
- **Archetype XP:** 1 XP for taking warmth from the living without being noticed; 3 XP for using what you've taken to accomplish something you couldn't have alone; 5 XP for recovering a piece of yourself you'd already lost to the Fading.
- **Alternate XP:** 1 XP for realizing something about yourself you'd already forgotten; 3 XP for frightening away something that threatened what remains of your tether; 5 XP for someone still choosing to help you despite what you've become.
- **Stress Relief:** taking warmth from someone who won't be missed; frightening a living person badly enough that they flee; recovering a memory you thought was gone.

## Beast Meter track — The Fading
1. Your edges blur in reflections and photographs. Nobody comments on it twice.
2. You lose your sense of duration. An hour and a week feel identical.
3. **(First Crack)** You forget a name that used to matter — permanently, with no way to recover it.
4. You can no longer remember the sound of your own living voice.
5. Places you haunted before begin rejecting you. The tether narrows.
6. **(Slipping)** You appear to strangers involuntarily, in moments of strong feeling.
7. You've forgotten how you died. The story you tell now is one you constructed.
8. You can't picture the living person you're tethered to unless they're in front of you.
9. **(Last Warning)** You've begun answering to a name that isn't yours, because it's the one people use.
10. **(Control)** What remains is a shape with a grievance and no memory of its cause. It haunts whatever's nearest.

## Powers
### Kind Powers

**PASSING THROUGH**
1. You can pass through walls, doors, and solid objects. Doing so is disorienting and takes a moment. When you Face Danger passing through them, add +1.
2. You move through solid matter freely and quickly. Add +2 when you Slip Away through obstacles.
3. You can carry a living person with you through solid matter, ignoring the disorientation yourself. The experience is deeply unpleasant for them.

**POLTERGEIST**
1. You can move small objects — doors, latches, papers, phones. When you Secure an Advantage that way, add +1. Sustained effort raises your Stress by 1.
2. You can exert real physical force: throw furniture, break glass, restrain a person briefly. Add +1 to rolls using it.
3. You can act physically in a Skirmish as though you had a body. Each Skirmish you do this in raises your Stress by 1.

**THE COLD TRUTH**
1. You can perceive the recent dead in a place, and sense violent deaths that happened there. When you Gather Information about them, add +1.
2. You can speak with the recently dead who haven't yet moved on. They answer honestly, though not always usefully. Add +1 to Compel them.
3. You can ask a question of the place itself — what happened here, and who was present. The GM answers honestly, in fragments. Add +1 to Gather Information that way.

**THE VEIL**
1. You are invisible to mortals by default and can choose to be seen by specific individuals. When you Slip Away unseen, add +1.
2. You can appear as you did in life, convincingly enough to fool someone who never knew you were dead. Add +1 to Compel them that way.
3. You can appear to someone at a distance, anywhere you have a connection — a place you died, a person you're tethered to, an object that was yours. Add +1 to Compel them that way.

**THE HAUNTING**
1. You can affect the atmosphere of a space — cold, sound, the feeling of being watched. When you Secure an Advantage that way, add +1.
2. Mortals in a space you're haunting must Face Danger to remain, or leave unsettled and unwilling to return.
3. You can make a place genuinely uninhabitable, driving out anything living. Doing so raises your Stress by 1.

**THE TETHER'S REACH**
1. When acting at or near your tether, add +1 to any roll.
2. You can move instantly to your tether from anywhere in the same city, and add +1 to your first roll on arrival.
3. You can extend your tether temporarily to a second anchor — a person, a place, an object — gaining its protection for a night.

### Anchored Powers

**THE GUARDIAN**
1. When you act to protect the subject of your tether, add +2.
2. You know instantly when your tether's subject is in danger, wherever they are. Add +1 to the first roll you make toward reaching them.
3. Once per session, prevent serious harm from reaching them entirely. Raise your Stress by 2.

**THE STILL SELF**
1. The Fading cannot take your memories. You always know your own name and history.
2. For the Fading's threshold, count your Stress as 2 lower than it is.
3. Once per session, restore something the Fading has already taken — a memory, a stat, a Connection.

### Unraveling Powers

**THE TAKING**
1. Draining warmth from a living person decreases your Stress by 3 instead of 2, and leaves them exhausted and cold.
2. You can drain from a distance, without touch, from anyone in the same room, and add +1 to Sate the Beast when you do.
3. You can take something more than warmth — a memory, a skill, a year. You gain it temporarily; they don't get it back.

**WHAT'S LEFT**
1. For each stat the Fading has taken from you, add +1 to one remaining stat of your choice.
2. You can act through the Fading rather than against it. Once per session, ignore a Fading penalty entirely.
3. You can let go of a piece of yourself deliberately — a memory, a Connection, a stat — in exchange for an automatic strong hit on any roll.`,
  },
];
