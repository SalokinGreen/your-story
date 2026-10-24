/**
 * Blood & Bone, AI edition: the five asset types.
 * Original text for the GM, condensed from the author's rulebook
 * (docs/blood-and-bone/rulebook.md). Not copied from any other product
 * (decision 3).
 */
import type { BuiltinNote } from "../types";

export const ASSET_NOTES: BuiltinNote[] = [
  {
    id: "builtin:blood-and-bone:paths",
    title: "B&B — Paths",
    type: "mechanics",
    tags: ["Blood & Bone","Asset"],
    content: `# B&B — Paths

Assets come in three abilities, bought in order: the asset costs 2 XP and gives its first ability; each further ability costs 3 XP. One use per session means once a night; mark it "used tonight" on the sheet. Adds from all sources cap at +2.

*What you were before this, and what it still lets you do.*

**INVESTIGATOR**
1. When you Gather Information through methodical investigation, add +1.
2. You can access records, case files, and official databases without raising flags. A weak hit on Gather Information from them comes with no complication.
3. Once per session, declare you already investigated something relevant before this scene began. The GM tells you what you found.

**FIXER**
1. Once per session, produce a mundane item, document, or introduction you shouldn't reasonably have.
2. When you Compel someone through a favor, debt, or trade, add +1.
3. Once per session, arrange something genuinely difficult off-screen — a clean identity, a body disposed of, a door left unlocked.

**DOCTOR**
1. You can treat serious mundane injury with what's on hand. Add +1 to any roll to stabilize someone.
2. You have access to medical facilities, supplies, and controlled substances. Add +1 to Secure an Advantage through them.
3. Once per session, save someone who should have died. Whatever it costs you, it costs you afterward.

**CRIMINAL**
1. When you Face Danger through breaking, entering, theft, or forgery, add +1.
2. You can move stolen goods, launder money, and read a criminal room accurately. Add +1 to Gather Information in a criminal room.
3. Once per session, declare you have a contact, an escape route, or a stash exactly where you need it.

**SOLDIER**
1. Add +1 to your first Action Roll in any Skirmish.
2. You're competent with any firearm or military hardware you get your hands on. Add +1 to Face Danger rolls made with it.
3. Once per session, ignore a "take a hit" cost from a weak hit in a Skirmish. Training holds.

**ACADEMIC**
1. When you Gather Information from documents, archives, or research, add +2.
2. You have institutional access — libraries, collections, colleagues who owe you answers. Add +1 to Secure an Advantage through them.
3. Once per session, know a specific historical or technical fact that resolves the situation.

**SOCIALITE**
1. When you Compel through charm, status, or social pressure, add +1.
2. You can get into any social space — a party, a gala, a members' club — without a plausible reason. Add +1 to the first Gather Information you make once inside.
3. Once per session, someone influential owes you a favor and pays it now.

**TRADESPERSON**
1. You can repair, modify, or defeat mundane mechanisms and structures. Add +1 when doing so.
2. You have a workshop, tools, and materials. Add +1 to Secure an Advantage through preparation.
3. Once per session, build or rig something the situation needs, given an hour and materials.

**JOURNALIST**
1. When you Gather Information through interview or conversation, add +2.
2. You can find anyone with a public footprint, and know what they'd rather you didn't. Add +1 to Compel them with it.
3. Once per session, apply public pressure — a story, a leak, a threat of one — and watch someone move.

**ADDICT**
1. When you Compel someone driven by a need or compulsion, add +2.
2. You recognize dependency in others instantly, and know how to feed or deny it. Add +1 to Gather Information about a person's weakness.
3. Once per session, endure a period of desperate craving without acting on it. Decrease your Stress by 1.

**PARENT**
1. When you act to protect someone weaker than you, add +1.
2. Your Connections resist decay: once per session, ignore a Connection rank decrease.
3. Once per session, someone chooses to trust you when they had every reason not to.

**PRIEST**
1. When you Compel through moral authority or genuine counsel, add +1.
2. You can access consecrated spaces, and mortals in crisis will speak to you honestly. Add +1 to Gather Information from them.
3. Once per session, remove 1 Stress from another character through confession, absolution, or witness.

**ATHLETE**
1. Add +1 to any Face Danger roll involving speed, endurance, or physical control.
2. You can push your body past reasonable limits without immediate consequence. Once a scene, ignore the cost of a weak hit on a Face Danger that was pure exertion or pain.
3. Once per session, achieve a physical feat that should have been impossible for you.

**PERFORMER**
1. When you Compel through performance, disguise, or misdirection, add +1.
2. You can pass as someone you aren't for an extended period without slipping. Add +1 to Face Danger to keep a false identity from slipping.
3. Once per session, hold a room's complete attention — no one notices anything else happening.

**SURVIVOR**
1. Add +1 to Face Defeat.
2. You always have a plan for going wrong. Add +1 to Slip Away.
3. Once per session, survive something that should have ended you, at a cost the GM names.

**LAWYER**
1. When you Compel using rules, procedure, or legal threat, add +1.
2. You can navigate institutions — courts, police, corporations — without being stopped. Add +1 to Secure an Advantage through them.
3. Once per session, make a serious mundane problem legally disappear.

**DRIVER**
1. Add +2 to Slip Away by vehicle.
2. You have a vehicle you trust, and it's where you left it. Add +1 to Face Danger when keeping it running under pressure.
3. Once per session, get anyone anywhere in the city faster than should be possible.

**SCIENTIST**
1. When you Gather Information through analysis, testing, or experiment, add +2.
2. You have lab access and can analyze biological or chemical evidence. Add +1 to Secure an Advantage with what you find.
3. Once per session, learn something true about a supernatural phenomenon by studying it directly.

**SMUGGLER**
1. You can move people, objects, or bodies across borders and checkpoints unseen. Add +1 to Face Danger doing so.
2. You know the Hollow Roads, or their local equivalent. Add +1 to travel between territories.
3. Once per session, arrive somewhere you had no legitimate way of reaching.

**OUTCAST**
1. Mortal systems don't track you. You have no meaningful records, and add +1 to avoid mundane surveillance.
2. You can disappear into a city's margins completely. Add +2 to Slip Away into a crowd or an underclass.
3. Once per session, be somewhere no one thought to look for you, because no one was looking for you at all.`,
  },
  {
    id: "builtin:blood-and-bone:havens",
    title: "B&B — Havens",
    type: "mechanics",
    tags: ["Blood & Bone","Asset"],
    content: `# B&B — Havens

Assets come in three abilities, bought in order: the asset costs 2 XP and gives its first ability; each further ability costs 3 XP. One use per session means once a night; mark it "used tonight" on the sheet. Adds from all sources cap at +2.

*Ground you hold. Somewhere to retreat, recover, and lose.*

**THE APARTMENT**
1. You have a private residence with no supernatural attention on it. Recover there and add +1 to Sate the Beast or Steel the Resolve.
2. It's secured — locks, sightlines, an exit that isn't the front door. Add +1 to Face Danger there.
3. It's genuinely unfindable. Anyone looking for it needs two separate leads, each a success, before they find it. Add +1 to Slip Away from it.

**THE BOLT-HOLE**
1. A concealed space — cellar, crawlspace, sealed room — that no records show exists. Add +1 to Slip Away into it.
2. You can reach it from at least two directions, and neither is obvious. Add +1 to Face Danger when someone follows you to it.
3. Once per session, escape into your bolt-hole and be gone, no roll required.

**THE PENTHOUSE**
1. Add +1 to any social roll made on your own ground. Nobody arrives uninvited.
2. Private security, controlled access, and staff who don't ask questions. Add +1 to Face Danger on your own ground.
3. Once per session, someone important comes to you because refusing you isn't an option.

**THE BELLTOWER**
1. A high, old structure you hold. Add +1 to observe the surrounding district.
2. It's structurally sound enough to survive Stone Slumber, fire, or siege. Add +1 to Secure an Advantage by fortifying it.
3. Nothing enters without you knowing. Add +2 to Face Danger defending it.

**THE WORKSHOP**
1. A dedicated working space with tools and materials. Add +1 to Secure an Advantage through preparation there.
2. You can build, repair, or modify almost anything mundane given time. Add +1 to Face Danger when you do it under pressure.
3. Once per session, produce something purpose-built for the current problem.

**THE WARDED HOUSE**
1. Standing wards turn away mortal attention entirely. Nobody wanders in. Add +1 to Slip Away or hide inside.
2. The wards bar one Kind of your choice. That Kind cannot enter without being invited; a player of that Kind who forces it must Face Danger, and any other creature of it is turned back at the threshold.
3. Once per session, for a scene, nothing supernatural can enter uninvited. Stress +1.

**THE UNDERGROUND**
1. You hold territory in tunnels, catacombs, or service ways. Add +1 to move unseen beneath the city.
2. You know routes nobody else has walked in decades. Add +2 to Slip Away underground.
3. You can reach most of the city without surfacing. Add +1 to Undertake a Journey across it.

**THE CLINIC**
1. Medical facilities and supplies. Anyone recovering here adds +1 to Sate the Beast or Steel the Resolve.
2. A reputation among people who need discretion. They come to you, and they bring information. Add +1 to Gather Information among them.
3. Once per session, someone's life saved here becomes a debt owed.

**THE BAR**
1. A public space you control. You hear everything said in it. Add +1 to Gather Information about the district.
2. It's recognized as neutral ground. Violence here costs the aggressor standing with everyone. Add +1 to Compel anyone there.
3. Once per session, someone you need walks in, because eventually everyone does.

**THE ARCHIVE**
1. A private collection of records, occult texts, and city history. Add +2 to Gather Information here.
2. Your archive contains something nobody else has. Once per session, it holds the answer.
3. Other factions know you have it, and would rather bargain than raid you. You are useful to people who could destroy you. Add +1 to Compel those who want it.

**THE GRAVEYARD**
1. Ground where the dead are gathered. Ghosts here are willing to speak with you. Add +1 to Gather Information from them.
2. You can move, conceal, or retrieve things among the dead unnoticed. Add +1 to Secure an Advantage there.
3. Once per session, the dead here answer a question honestly.

**THE PACK GROUND**
1. Shared territory. Any packmate recovering here adds +1 to Sate the Beast or Steel the Resolve.
2. The pack knows instantly when it's trespassed upon. Nothing ambushes you there, and add +1 to Face Danger on it.
3. Once per session, the pack defends this ground successfully without you needing to be present.

**THE SAFEHOUSE NETWORK**
1. Multiple small refuges across the city. Once per session, one is nearby.
2. They're stocked and maintained. Recover at any of them and add +1 to Sate the Beast or Steel the Resolve.
3. Once per session, declare a safehouse exists in a different city entirely.

**THE CHAPEL**
1. Sanctified ground you have access to. Mortals feel safe here, and speak freely. Add +1 to Compel them.
2. Most supernatural creatures cannot follow you in without cost. Add +1 to Face Danger against any that do.
3. Once per session, remove 1 Stress here through ritual, confession, or simple stillness.

**THE COUNTRY HOUSE**
1. Isolated property with land around it. No witnesses, no neighbours, no interruptions. Add +1 to Clean Up done there.
2. Space to do things that need space — burial, containment, a full moon. Add +1 to Secure an Advantage there.
3. Once per session, hold or hide something here that could not be held anywhere else.

**THE VAULT**
1. A genuinely secure storage space. Anything left here stays here. Add +1 to Clean Up concerning what it holds.
2. It's warded or engineered against a specific threat you name. Add +1 to Face Danger against that threat there.
3. Once per session, retrieve something from the vault you'd forgotten you'd stored.

**THE TENEMENT**
1. You control a residential building. Its tenants notice things and tell you. Add +1 to Gather Information about the neighbourhood.
2. The tenants protect you instinctively — nobody saw anything, nobody's home. Add +1 to Slip Away in the building.
3. Once per session, the building itself obstructs a pursuer entirely.

**THE THEATRE**
1. A performance space you hold. Any activity here has a plausible cover. Add +1 to Clean Up done there.
2. Storage, costume, and machinery. Add +1 to Secure an Advantage involving disguise or spectacle.
3. Once per session, stage something that convinces an audience of something untrue.

**THE RIVER HOUSE**
1. Property on running water. Several Kinds find it difficult to approach. Add +1 to Face Danger from them on it.
2. A boat, a dock, and a route out that leaves no road behind. Add +1 to Slip Away by water.
3. Once per session, running water carries away evidence, pursuit, or a body entirely.

**THE FORGOTTEN ROOM**
1. A space with no records, no owner, and no address. It does not officially exist. Add +1 to Slip Away into it.
2. Nothing supernatural senses it easily. Add +2 to conceal anything kept here.
3. Once per session, vanish into the Forgotten Room completely. Nothing can follow, track, or scry you until you leave.`,
  },
  {
    id: "builtin:blood-and-bone:companions",
    title: "B&B — Companions",
    type: "mechanics",
    tags: ["Blood & Bone","Asset"],
    content: `# B&B — Companions

Assets come in three abilities, bought in order: the asset costs 2 XP and gives its first ability; each further ability costs 3 XP. One use per session means once a night; mark it "used tonight" on the sheet. Adds from all sources cap at +2.

*Someone who is actually there. They can act, and they can be taken from you.*

**THE GHOUL**
1. A mortal servant, loyal past reason. They can act in daylight and handle mundane business. Add +1 to Secure an Advantage through them.
2. They're unnaturally durable and fast. In a Skirmish, they may take a hit meant for you.
3. Once per session, they do something for you that a person with free will wouldn't.

**THE FAMILIAR SPIRIT**
1. A bound spirit that can observe, carry messages, and pass unseen. Add +1 to Secure an Advantage through it.
2. It can act independently. Add +2 to Gather Information through it.
3. You can see and speak through it at any distance. Nothing ambushes you while it watches.

**THE PACKMATE**
1. A werewolf who runs with you. Add +1 to any Skirmish they're present for.
2. They can hold ground, track, or fight while you do something else. Add +1 to Secure an Advantage when they do.
3. Once per session, they take a defeat in your place and survive it.

**THE PARTNER**
1. A mortal ally who knows the truth. Add +1 to Steel the Resolve or any Heart roll with them present.
2. They can operate freely in mortal spaces — daylight, institutions, records. Add +1 to Gather Information through them.
3. Once per session, they talk you down from something you were about to do.

**THE APPRENTICE**
1. A student who assists your work. Add +1 to any roll they help with.
2. They can perform simple versions of your work independently. Add +1 to Secure an Advantage through their work.
3. Once per session, they do something you didn't teach them, and it works.

**THE HOUND**
1. A large, loyal animal. It tracks, warns, and is entirely unafraid of you. Add +1 to Gather Information by tracking.
2. It senses supernatural presence before you do. Nothing ambushes you.
3. In a Skirmish, it fights alongside you. Once per fight, improve one recorded exchange a step (miss to weak hit, weak hit to strong hit) before you record it.

**THE CHILDE**
1. A vampire you turned. They act in your interest, mostly. Add +1 to Secure an Advantage through them.
2. They have territory or access you don't. Add +1 when operating through them.
3. Once per session, they handle something entirely on your behalf. The GM says what it cost them.

**THE DRIVER**
1. A mortal with a vehicle who works for you. Add +1 to Slip Away by road.
2. They know the city's routes, chokepoints, and cameras. Add +1 to Gather Information about movement in the city.
3. Once per session, they're already there when you come out running.

**THE MEDIC**
1. A medically trained ally. Anyone they treat recovers faster and more completely. Once per session, remove 1 Stress from someone they treat.
2. They can source drugs, blood, and equipment. Add +1 to Secure an Advantage with them.
3. Once per session, they save someone who was already gone.

**THE INFORMANT**
1. A source inside a faction, institution, or court. Add +1 to Gather Information about it.
2. They can pass you documents, schedules, and names. Add +1 to Secure an Advantage with them.
3. Once per session, they warn you about something before it happens.

**THE MUSCLE**
1. A capable fighter who works for you. Add +1 to your first Skirmish roll when present.
2. They can handle a mundane threat entirely without you. Add +1 to Face Danger if you stay and let them.
3. Once per session, they finish a fight you were losing.

**THE BOUND SHADE**
1. A spirit ally who can scout, observe, and pass through walls. Add +1 to Secure an Advantage by scouting.
2. They can speak with the dead on your behalf. Add +1 to Gather Information from the dead.
3. Once per session, they possess or influence a mortal briefly on your instruction.

**THE ELDER**
1. An ancient of your Kind who tolerates you. Add +1 to any roll made on their advice.
2. They'll answer one question honestly per session, if asked properly. Add +1 to the next roll that uses the answer.
3. Once per session, invoking their name resolves a situation. You now owe them more.

**THE MORTAL FAMILY**
1. A family who believe you're still who you were. Their home is genuinely safe. Add +1 to Slip Away to it.
2. Time with them removes 1 Stress once per session.
3. Once per session, protecting them gives you clarity: turn a miss into a weak hit.

**THE RIVAL**
1. Someone who works against you and alongside you by turns. Add +1 when your goals align.
2. They'll trade information honestly, because mutual leverage is worth more than a win. Add +1 to Gather Information through them.
3. Once per session, they save you — and make sure you know exactly what it obligates.

**THE FENCE**
1. A dealer in stolen, illegal, and unusual goods. You can sell or source almost anything. Add +1 to Secure an Advantage with goods bought.
2. They know who else has been buying, and what. Add +1 to Gather Information about a purchase.
3. Once per session, they produce something genuinely rare on short notice.

**THE WITNESS**
1. A mortal who knows what you are and hasn't told anyone. They watch your blind spots. Add +1 to Face Danger from a surprise.
2. They can corroborate, alibi, or misdirect on your behalf. Add +1 to Clean Up.
3. Once per session, their testimony resolves a masquerade problem entirely.

**THE VIGIL CONTACT**
1. A hunter who'll talk to you. Add +1 to Gather Information about supernatural threats.
2. They'll warn you if the Vigil turns its attention your way. Add +1 to Slip Away from the Vigil.
3. Once per session, they call off, delay, or misdirect a hunt.

**THE STRAY**
1. A dependent who follows you. They're useless in a fight and notice everything. Add +1 to Gather Information by observation.
2. They ask questions nobody else asks. Once per session, they see what you missed.
3. Once per session, their presence stops you from doing something irreversible. Decrease your Stress by 1.

**THE LAWYER ON RETAINER**
1. Legal representation available at any hour. Mundane authorities become manageable. Add +1 to Compel a mundane authority.
2. They can tie up an investigation, a property dispute, or an inquiry indefinitely. Add +1 to Secure an Advantage against one.
3. Once per session, a serious mundane consequence simply doesn't arrive.`,
  },
  {
    id: "builtin:blood-and-bone:relics",
    title: "B&B — Relics",
    type: "mechanics",
    tags: ["Blood & Bone","Asset"],
    content: `# B&B — Relics

Assets come in three abilities, bought in order: the asset costs 2 XP and gives its first ability; each further ability costs 3 XP. One use per session means once a night; mark it "used tonight" on the sheet. Adds from all sources cap at +2.

*Objects that carry weight. Some of them carry you.*

**THE GRIMOIRE**
1. A book of workings. Add +1 to any magical Rite performed with it to hand.
2. It contains something specific you haven't read yet. Once per session, find a working you need.
3. It answers questions. Ask it one per session; it responds, obliquely and truthfully.
*If this is your anchor, its loss reduces you to a mortal until recovered.*

**THE INHERITED WEAPON**
1. A weapon with history. Add +1 to Skirmish rolls made with it.
2. It's effective against the supernatural in ways it shouldn't be. Ignore a monster's physical resistance.
3. Once per session, it strikes true regardless of circumstance — an automatic strong hit on one attack.

**THE SILVER**
1. Silver weapons or bindings. Werewolf wounds you inflict cannot heal supernaturally.
2. Enough of it to bind, bar, or fortify. Add +1 to Secure an Advantage against a Werewolf, and +1 to Skirmish rolls against one while you hold it.
3. Once per session, silver stops something dead that nothing else would have.

**THE SIGNET**
1. A mark of standing. Others of your Kind recognize your position on sight. Add +1 to Gather Information among them.
2. Add +1 to Compel within your Kind's political structures.
3. Once per session, invoking it opens a door — literal or otherwise — that was closed.

**THE TETHER OBJECT**
1. The object your unfinished business attaches to. Near it, add +1 to any roll.
2. You can sense its location and condition from anywhere. Add +1 to Gather Information about it.
3. You can move instantly to it, once per session, from anywhere in the same city.
*If this is your tether, its destruction forces you to move on, permanently.*

**THE OLD PHOTOGRAPH**
1. An image of your mortal life. Holding it steadies you: once per session, ignore a Stress increase.
2. It reminds you of a specific person. Add +1 to any roll made on their behalf or memory.
3. Once per session, it anchors you: turn a miss on Sate the Beast, Resist the Hunger or Steel the Resolve into a weak hit (not on the Reckoning or the Fading).

**THE WARD-STONE**
1. A portable ward. Any space you place it in turns away mortal attention. Add +1 to Slip Away in a space it guards.
2. It bars one Kind you name. That Kind cannot approach it: a player of that Kind who pushes in must Face Danger, and any other creature of it is turned back.
3. Once per session, it stops something supernatural entirely, then cracks. Repairing it takes a Rite.

**THE BLADE THAT REMEMBERS**
1. A weapon that has killed something supernatural. Add +1 against that Kind.
2. It shows you flashes of what it's done. Add +1 to Gather Information about violence.
3. Once per session, it acts before you do: the first exchange you roll in a Skirmish is improved a step (miss to weak hit, weak hit to strong hit) before you record it.

**THE VESSEL**
1. A container holding a bound spirit or power. It can be questioned, once per session.
2. What's inside can be directed to act, briefly and reluctantly. Add +1 to Secure an Advantage when it does.
3. You may release what's inside for one scene of enormous, uncontrolled effect. It does not go back in easily. Treat one roll in that scene as a strong hit; the GM says what it costs.

**THE MASK**
1. A mask, veil, or disguise of real provenance. Add +2 to pass as someone else while wearing it.
2. Nobody can identify you by supernatural means while it's on. Add +1 to Slip Away while wearing it.
3. Once per session, be believed as someone specific, by someone who knows them.

**THE LEDGER-BOOK**
1. A physical record of what you owe and to whom. You always know your exact Ledger count. Add +1 to Compel someone whose debt you can name.
2. You can see others' debts too. Add +2 to Gather Information about a pact or obligation.
3. Once per session, transfer one Ledger mark to someone else who has earned it.

**THE RELIQUARY**
1. A sanctified object. Undead and unclean things hesitate around it. Add +1 to Slip Away from them.
2. It can consecrate a space temporarily. Add +1 to defend anywhere you've placed it.
3. Once per session, it repels something outright — no roll, no contest, and it costs you to hold.

**THE HUNTING RIFLE**
1. A firearm you trust completely. Add +1 to Nerve rolls made with it.
2. It's been modified for things that don't die normally. Add +1 against supernatural targets.
3. Once per session, take a shot that should have been impossible. It lands.

**THE COFFIN**
1. Somewhere sealed to rest in. Sunlight and disturbance cannot reach you within it.
2. It's yours specifically. Resting in it removes 1 additional Stress.
3. Once per session, wake early from it — alert, immediately, and hungry. Add +1 to your first roll on waking.

**THE MAP**
1. A record of Hollow Roads, tunnels, or old ways. Add +1 to travel unseen.
2. It's annotated by people who came before. Once per session, it shows a route out.
3. It updates itself. It knows about closures, ambushes, and claims before you do.

**THE LOCK OF HAIR**
1. A physical token of a specific person. You always know if they're alive. Add +1 to any roll to protect them.
2. You can find them, anywhere, given time. Add +2 to Gather Information to locate them.
3. Once per session, reach them — a dream, a whisper, a sudden certainty — regardless of distance.

**THE BROKEN CHAIN**
1. A restraint you escaped. You can defeat any mundane binding. Add +1 to Face Danger when held or restrained.
2. You cannot be held against your will by mundane means at all. Add +1 to Slip Away from captivity.
3. Once per session, escape a supernatural binding, cage, or compulsion outright.

**THE CITY KEY**
1. A key, card, or token granting access to a network of buildings. Add +1 to Secure an Advantage through that access.
2. Nobody questions your presence where it works. Add +1 to move through controlled spaces.
3. Once per session, it opens a door it has no business opening.

**THE JAR OF ASHES**
1. Cremated remains you keep. Their ghost, if it lingers, will speak to you. Add +1 to Gather Information from it.
2. Add +2 to any Rite performed using them.
3. Once per session, call on them for aid — knowledge, warning, or a moment's intervention.

**THE FIRST TROPHY**
1. An object from your turning, your first kill, or your death. Add +1 to rolls involving your origin.
2. Holding it, you remember precisely who you were. Once per session, ignore a Fading or Mask penalty.
3. Once per session, it grants you a moment of your old self: reroll any roll, and take the second result.`,
  },
  {
    id: "builtin:blood-and-bone:rites",
    title: "B&B — Rites",
    type: "mechanics",
    tags: ["Blood & Bone","Asset"],
    content: `# B&B — Rites

Assets come in three abilities, bought in order: the asset costs 2 XP and gives its first ability; each further ability costs 3 XP. One use per session means once a night; mark it "used tonight" on the sheet. Adds from all sources cap at +2. A Rite is never instant: it needs preparation, materials or ceremony, so if there is no time there is no Rite.

*Procedures, not instincts. Every Rite needs time, materials, and the fiction's permission.*

**THE BLOOD BOND** *(Vampire)* — *Three drinks, and they're yours.*
1. Feeding a mortal your blood makes them loyal and suggestible for a month. A weak hit on Compel against them counts as a strong hit.
2. Repeated over three occasions, the bond becomes genuine devotion. Treat them as a Connection at Steady.
3. You can bond another supernatural creature. Add +2 to Compel them. It is a profound violation, and everyone will treat it as one.

**THE CLAIMING** *(Gargoyle)* — *You mark it, and then it's yours.*
1. A night's ritual marks territory as yours. Sate the Beast there as though long-established.
2. Your claim is legible to other supernaturals. They know who holds this ground. Add +1 to Compel them there.
3. You can claim territory already held by another. Doing so is a declaration of war, and the ground itself sides with the winner. Add +2 to Compel or Secure an Advantage against the old claimant on that ground.

**THE WINTER FAST** *(Wendigo)* — *You've learned to hold the hunger still.*
1. A night of ritual fasting halts Stress escalation entirely for the following day.
2. The fast holds for a full week, provided nothing forces you to feed. Add +1 to Resist the Hunger while it lasts.
3. Once per session, break the fast deliberately for a surge of strength: an automatic strong hit, then Stress +2.

**THE MOON RUN** *(Werewolf)* — *The whole pack, one night, no city.*
1. A pack hunt under open sky. Every participant removes 1 Stress.
2. The run reforges the bond. Restore one Connection's rank among packmates.
3. Once per session, the pack acts as one thereafter: any packmate may use another's stat for a roll.

**THE SUMMONING** *(Witch/Warlock)* — *You call, and something comes.*
1. Summon a minor spirit for a single question or task. Add +1 to the next roll that uses its answer. Add 1 Ledger mark.
2. Summon something significant, bound to a circle. Add +2 to Secure an Advantage through its task. Add 2 Ledger marks.
3. Summon something that should not be summoned. Treat one roll made through its task as a strong hit. Add 4 Ledger marks, and understand it now knows your name.

**THE CONSECRATION** *(Hunter)* — *You make the ground argue on your side.*
1. A night's work sanctifies a space. Supernatural creatures entering are stopped at the edge unless you let them in; a player character who forces it must Face Danger.
2. The consecration holds for a month, and you know when it's tested.
3. Once per session, a consecrated space stops something entirely — the Rite breaks, and the thing does not enter.

**THE ANCHORING** *(Ghost)* — *You tie yourself down harder.*
1. A ritual reinforcing your tether. The Fading cannot progress for a week.
2. You may shift your tether to a new object, place, or person. Add +1 to the next Steel the Resolve or Resist the Hunger roll that draws on the new tether.
3. Once per session, anchor another spirit, halting their Fading temporarily.

**THE SEVERING**
1. Sever a mundane tie: an identity, a record, a claim on you. Add +1 to Slip Away from whoever held it.
2. Sever a supernatural tie — a curse, a compulsion, a lesser binding. Add +1 to Face Danger from that source afterward.
3. Once per session, sever a Burden. It requires everything the Rite asks and then more.

**THE MASKING**
1. A ritual that hides your Kind from supernatural senses for a night. Add +1 to Slip Away from them.
2. It hides you from mundane surveillance too — cameras, records, recognition. Add +1 to Clean Up.
3. Once per session, become genuinely unfindable for a full day, by any means.

**THE SCRYING**
1. Observe a place you've been, at a distance, for a short time. Add +1 to Secure an Advantage based on what you saw.
2. Observe a person you have something of. Add +2 to Gather Information about them.
3. Once per session, see something happening right now, anywhere, that concerns you directly.

**THE OATH-BINDING**
1. Bind two willing parties to an agreement. Both know instantly if it's broken. Add +1 to Compel either to keep it.
2. Breaking the oath carries a real cost — the GM applies an immediate consequence to the breaker.
3. Once per session, bind an unwilling party to a promise. It will hold. They will remember.

**THE MENDING**
1. Repair a damaged object of significance, restoring its properties. Add +1 to the next roll that uses it.
2. Restore a broken ward, seal, or binding to full strength. Add +1 to Secure an Advantage with it.
3. Once per session, restore something that was destroyed rather than damaged. It comes back changed.

**THE WAKE**
1. A night spent watching over a body, a place, or an object reveals its recent history. Add +1 to Gather Information about it.
2. The dead, or the place, will answer three questions honestly. Add +1 to the next roll that uses an answer.
3. Once per session, learn something nobody living knows.

**THE FEEDING RITE**
1. Ritualizing your feeding removes the complication on a weak hit for Sate the Beast.
2. A properly performed feeding rite removes 3 Stress on a strong hit instead of 2.
3. Once per session, feed without any Stress escalation trigger applying afterward.

**THE WARDING CIRCLE**
1. A circle that contains or excludes one named creature for a scene. Add +1 to Face Danger from it.
2. It holds for a full night, and the thing inside cannot act beyond it.
3. Once per session, the circle holds something far stronger than it should. It will not hold twice.

**THE PASSING**
1. Guide a lingering spirit to rest. It goes peacefully. Add +1 to Compel it first.
2. You can resolve a Ghost's unfinished business on their behalf, if you know it. Add +1 to Gather Information about it.
3. Once per session, release something bound, cursed, or trapped — including, if you choose, yourself.

**THE INHERITANCE**
1. Perform this over the remains of your Kind to learn something they knew. Add +1 to Gather Information through it.
2. You gain temporary use of one of their Powers for a session.
3. Once per session, permanently take one first-tier ability from a defeated creature's Power. Something of theirs stays in you.

**THE CONFESSION**
1. Once per session, confess honestly to another character. Both of you remove 1 Stress.
2. Once per session, the confession creates real intimacy: raise the rank of the Connection between you.
3. Once per session, confess something that should have destroyed a relationship — and it holds instead.

**THE CALLING DUE**
1. Force a faction or creature to state exactly what you owe them. They must answer honestly. Add +1 to Compel them afterward.
2. After a single dangerous act that serves the debt, cancel one named complication of a Burden for the rest of the session.
3. Once per session, resolve a Burden entirely. What it costs will not be small, and the GM decides it.

**THE LONG NIGHT**
1. A night of preparation before a known danger. Add +1 to your first roll in the coming conflict.
2. Everyone who participates gains that bonus, and knows the plan.
3. Once per session, the preparation was so thorough that a disaster simply doesn't land. Describe what you'd already accounted for.`,
  },
];
