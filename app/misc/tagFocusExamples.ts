/**
 * Curated "how the GM could focus on this tag" examples for the director
 * layer's spotlight_tag move (see selectDirectorMove in mythic.ts).
 *
 * Keyed by the exact tag strings from GuidedStoryStart.tsx's
 * PERSONALITY_TAGS and WISH_TAGS - the curated vocabulary players pick from
 * at story start (StoryData.playerPersonalityTags/playerWishTags for solo
 * play, CouchPlayer.personalityTags/wishTags for couch co-op). Freeform text
 * (wishText) has no matching bank and isn't tag-matchable.
 *
 * Each tag gets exactly 10 examples; selectDirectorMove samples 3 at random
 * via pickTagFocusExamples and persists them on the PendingDirectorMove so
 * they stay stable while the move is pending. Each example also suggests a
 * built-in roll_table table_name (see ELEMENT_TABLES/ElementCategory in
 * mythic.ts) the GM can optionally roll on for inspiration when playing it
 * out - not a requirement, just a nudge toward using the oracle rather than
 * inventing everything from scratch.
 */

import type { ElementCategory } from "./mythic";

export interface TagFocusExample {
  prompt: string; // How the GM could bring this tag into focus this scene
  table: ElementCategory; // Suggested roll_table table_name for inspiration
}

export const TAG_FOCUS_EXAMPLES: Record<string, TagFocusExample[]> = {
  // ===== Personality tags =====
  Brave: [
    {
      prompt:
        "Put them between danger and someone who can't defend themselves, and let them choose to step forward.",
      table: "character_actions_combat",
    },
    {
      prompt:
        "Have an ally freeze or flee first, so their nerve is the only thing holding the line.",
      table: "character_traits_flaws",
    },
    {
      prompt:
        "Dare them with a physically terrifying obstacle that has an easier, safer way around it - see which one they take.",
      table: "terrain",
    },
    {
      prompt:
        "Let an NPC openly doubt their courage to their face, in front of people whose opinion matters to them.",
      table: "character_conversations",
    },
    {
      prompt:
        "Drop them into a situation where hesitating even a few seconds has a real cost.",
      table: "plot_twists",
    },
    {
      prompt:
        "Have a creature or foe specifically target the most fearsome-looking threat, expecting them to break - then see if they don't.",
      table: "creature_descriptors",
    },
    {
      prompt:
        "Offer a reckless shortcut through danger versus a slow, safe route - frame it as a choice only they'd actually consider.",
      table: "dungeon_traps",
    },
    {
      prompt:
        "Let their boldness inspire (or endanger) someone else who's watching them closely.",
      table: "character_motivations",
    },
    {
      prompt:
        "Confront them with a fear that isn't physical - a confession, an apology, a truth they've been avoiding.",
      table: "cryptic_message",
    },
    {
      prompt:
        "Have the environment itself dare them: a collapsing bridge, a burning building, a ledge nobody else will cross.",
      table: "dungeon",
    },
  ],
  Cunning: [
    {
      prompt:
        "Present a problem that brute force obviously can't solve, and let them find the angle nobody else sees.",
      table: "plot_twists",
    },
    {
      prompt:
        "Have an NPC underestimate them, then watch them use that misjudgment against the NPC.",
      table: "character_traits_flaws",
    },
    {
      prompt:
        "Offer two doors: the honest one that costs them something, and the clever one that costs someone else.",
      table: "cryptic_message",
    },
    {
      prompt:
        "Let them overhear a piece of information others missed, and see how they leverage it.",
      table: "character_conversations",
    },
    {
      prompt:
        "Put them in a negotiation where the stated terms are a trap - see if they read between the lines.",
      table: "character_motivations",
    },
    {
      prompt:
        "Give a rival a scheme in progress; let the cunning character notice the seams.",
      table: "legends",
    },
    {
      prompt:
        "Have a locked door, a guarded vault, or a rigged game that rewards misdirection over force.",
      table: "dungeon_traps",
    },
    {
      prompt:
        "Let an ally propose a straightforward plan and have them quietly counter-propose a smarter one.",
      table: "character_actions_general",
    },
    {
      prompt:
        "Drop a rumor or forged document into play and see if they spot - or exploit - the deception.",
      table: "cryptic_message",
    },
    {
      prompt:
        "Confront them with someone as cunning as they are, so the scene becomes a battle of wits.",
      table: "character_identity",
    },
  ],
  Curious: [
    {
      prompt:
        "Leave a locked, unlabeled, obviously-not-for-them door or container somewhere they'll pass by.",
      table: "dungeon",
    },
    {
      prompt:
        "Have an NPC clam up the moment a specific topic comes up - and let the silence be the hook.",
      table: "character_conversations",
    },
    {
      prompt: "Plant an object whose purpose isn't explained anywhere nearby.",
      table: "magic_item",
    },
    {
      prompt:
        "Give them a choice between the fast, safe path and the strange, unexplained detour.",
      table: "terrain",
    },
    {
      prompt:
        "Let a stranger mention something in passing that raises far more questions than it answers.",
      table: "cryptic_message",
    },
    {
      prompt: "Surface an inconsistency in a story an NPC already told them.",
      table: "character_background",
    },
    {
      prompt: "Offer a book, journal, or inscription that's clearly incomplete.",
      table: "legends",
    },
    {
      prompt:
        "Have a creature behave in a way that defies what they'd expect from its kind.",
      table: "creature_descriptors",
    },
    {
      prompt: "Dangle a mystery that a companion actively wants to leave alone.",
      table: "plot_twists",
    },
    {
      prompt: "Put a strange sound or smell somewhere it has no business being.",
      table: "sounds",
    },
  ],
  Charming: [
    {
      prompt:
        "Put a hostile NPC in front of them who could be talked down instead of fought.",
      table: "character_conversations",
    },
    {
      prompt:
        "Have someone immune to almost everyone else's charm - let them try anyway.",
      table: "character_traits_flaws",
    },
    {
      prompt:
        "Offer a social gate (a bouncer, a noble, a suspicious guard) that opens only with the right words.",
      table: "noble_house",
    },
    {
      prompt:
        "Let an NPC develop a genuine soft spot for them that complicates a later scene.",
      table: "character_motivations",
    },
    {
      prompt:
        "Drop them into a crowd or party where working the room matters more than any roll.",
      table: "city",
    },
    {
      prompt: "Have a rival try to out-charm them in front of an audience.",
      table: "character_actions_general",
    },
    {
      prompt: "Give them a favor to call in - see who they charm into using it.",
      table: "character_identity",
    },
    {
      prompt:
        "Let them talk their way past a problem the rest of the party was ready to fight.",
      table: "character_actions_combat",
    },
    {
      prompt:
        "Have their charm work almost too well, and let them deal with the awkward fallout.",
      table: "plot_twists",
    },
    {
      prompt:
        "Put someone in their debt emotionally, not materially, and see what they do with that.",
      table: "character_background",
    },
  ],
  Chaotic: [
    {
      prompt:
        "Hand them a stable, orderly situation and see how long it stays that way.",
      table: "civilization",
    },
    {
      prompt:
        "Give them a rule everyone else is following - and no one's watching to see if they break it.",
      table: "character_traits_flaws",
    },
    {
      prompt:
        "Let an unplanned, disruptive option exist right next to the sensible one.",
      table: "plot_twists",
    },
    {
      prompt:
        "Have their unpredictability throw off an enemy who was counting on a normal reaction.",
      table: "creature_abilities",
    },
    {
      prompt:
        "Drop a genuinely wild card into a tense negotiation and let them be the one holding it.",
      table: "cryptic_message",
    },
    {
      prompt:
        "Put a structured plan in front of the party and see if they improvise around it anyway.",
      table: "character_actions_general",
    },
    {
      prompt:
        "Let an NPC be completely thrown by a choice that made total sense to them.",
      table: "character_conversations",
    },
    {
      prompt: "Offer a small, victimless bit of mayhem purely for its own sake.",
      table: "adventure_tone",
    },
    {
      prompt:
        "Have consequences catch up unpredictably from something chaotic they did earlier.",
      table: "legends",
    },
    {
      prompt:
        "Give them a moment where order and chaos are both on the table, and let them tip it.",
      table: "powers",
    },
  ],
  Cautious: [
    {
      prompt:
        "Put an obviously too-good-to-be-true opportunity in front of the whole party and let them be the one who hesitates.",
      table: "cryptic_message",
    },
    {
      prompt:
        "Have a companion push to move fast while the situation clearly calls for care.",
      table: "character_conversations",
    },
    {
      prompt:
        "Reward their caution by having a rushed alternative visibly go wrong for someone else.",
      table: "plot_twists",
    },
    {
      prompt: "Give them a chance to scout, check, or verify before anyone commits.",
      table: "dungeon",
    },
    {
      prompt: "Let a trap or ambush exist that only their care would have caught.",
      table: "dungeon_traps",
    },
    {
      prompt:
        "Put pressure (a countdown, an impatient ally) directly against their instinct to slow down.",
      table: "character_motivations",
    },
    {
      prompt:
        "Have an NPC read their caution as distrust, and force a conversation about it.",
      table: "character_conversations",
    },
    {
      prompt: "Offer information that's suspiciously easy to get.",
      table: "legends",
    },
    {
      prompt:
        "Let their preparation matter concretely later - a contingency they set up now pays off.",
      table: "objects",
    },
    {
      prompt: "Put them in a situation where caution costs time they may not have.",
      table: "adventure_tone",
    },
  ],
  "Hot-headed": [
    {
      prompt: "Have someone deliberately provoke them in front of people whose opinion matters.",
      table: "character_conversations",
    },
    {
      prompt: "Give them a slight they can't ignore without losing face.",
      table: "character_traits_flaws",
    },
    {
      prompt:
        "Let their temper get them somewhere calm words never would - and let it cost something too.",
      table: "plot_twists",
    },
    {
      prompt:
        "Put a cooler-headed ally directly at odds with their instinct to act now.",
      table: "character_motivations",
    },
    {
      prompt: "Offer a target for their anger that isn't actually the real problem.",
      table: "character_identity",
    },
    {
      prompt: "Have a situation escalate fast enough that there's no time to think it through.",
      table: "character_actions_combat",
    },
    {
      prompt: "Let an old grudge resurface at the worst possible moment.",
      table: "legends",
    },
    {
      prompt:
        "Give them a reason to regret something they said or did in the heat of the moment.",
      table: "character_conversations",
    },
    {
      prompt: "Put them face-to-face with someone who mirrors their temper right back.",
      table: "character_traits_flaws",
    },
    {
      prompt: "Have their outburst be witnessed by someone who'll remember it.",
      table: "character_background",
    },
  ],
  "Kind-hearted": [
    {
      prompt:
        "Put someone genuinely in need directly in their path, with a real cost to helping.",
      table: "character_background",
    },
    {
      prompt:
        "Let their kindness be tested by someone who doesn't deserve it, and see if they help anyway.",
      table: "character_motivations",
    },
    {
      prompt:
        "Have an NPC's trust in them grow because of a small, unrewarded kindness earlier.",
      table: "character_conversations",
    },
    {
      prompt:
        "Offer a chance to show mercy where the mechanically 'correct' move is to not.",
      table: "plot_twists",
    },
    {
      prompt: "Put a creature or foe in a state where violence isn't the only option.",
      table: "creature_descriptors",
    },
    {
      prompt: "Let their compassion be the thing that talks someone back from the edge.",
      table: "character_actions_general",
    },
    {
      prompt: "Have someone exploit their kindness, and let the fallout land honestly.",
      table: "character_traits_flaws",
    },
    {
      prompt: "Give them a small, quiet act of generosity nobody's watching them do.",
      table: "adventure_tone",
    },
    {
      prompt: "Let a past kindness come back around from someone they helped long ago.",
      table: "legends",
    },
    {
      prompt: "Put them between two people in conflict, both of whom they genuinely care about.",
      table: "character_identity",
    },
  ],
  Mysterious: [
    {
      prompt: "Have an NPC try - and fail - to place where they're really from.",
      table: "character_background",
    },
    {
      prompt: "Let someone ask a direct question they clearly don't want to answer.",
      table: "character_conversations",
    },
    {
      prompt: "Drop a hint about their past that raises more questions than it settles.",
      table: "legends",
    },
    {
      prompt: "Have their reputation precede them somewhere they've never actually been.",
      table: "character_identity",
    },
    {
      prompt: "Give them a private moment the rest of the party doesn't get to see.",
      table: "visions_dreams",
    },
    {
      prompt:
        "Let an item, mark, or ability of theirs draw an unexplained reaction from someone.",
      table: "magic_item",
    },
    {
      prompt: "Put them somewhere their unexplained skills suddenly matter.",
      table: "character_skills",
    },
    {
      prompt: "Have a stranger recognize them - and refuse to say from where.",
      table: "character_conversations",
    },
    {
      prompt: "Offer a chance to reveal something real about themselves, and see if they take it.",
      table: "cryptic_message",
    },
    {
      prompt: "Let a rumor about them reach the party before they can explain it themselves.",
      table: "legends",
    },
  ],
  Funny: [
    {
      prompt:
        "Let a tense scene have exactly one beat where their humor can cut it - or make it worse.",
      table: "adventure_tone",
    },
    {
      prompt: "Have an NPC be completely unmoved by their jokes, on purpose.",
      table: "character_traits_flaws",
    },
    {
      prompt: "Give them a target audience that actually needs the laugh.",
      table: "character_conversations",
    },
    {
      prompt: "Let a joke land at the worst possible moment and have real consequences.",
      table: "plot_twists",
    },
    {
      prompt:
        "Have their comic timing accidentally solve (or wreck) a delicate social situation.",
      table: "character_actions_general",
    },
    {
      prompt: "Put a deadly serious NPC in a scene with them and see what happens.",
      table: "character_identity",
    },
    {
      prompt: "Let humor be the thing that gets a scared NPC to open up.",
      table: "character_motivations",
    },
    {
      prompt: "Offer a recurring bit or callback from earlier that pays off now.",
      table: "legends",
    },
    {
      prompt: "Have someone laugh at exactly the wrong target, and let them navigate it.",
      table: "character_conversations",
    },
    {
      prompt: "Give them a genuinely absurd situation with real stakes underneath it.",
      table: "creature_descriptors",
    },
  ],
  Ruthless: [
    {
      prompt:
        "Offer a choice where mercy costs the mission and cruelty completes it cleanly.",
      table: "plot_twists",
    },
    {
      prompt: "Have an ally flinch at something they're willing to do without hesitation.",
      table: "character_conversations",
    },
    {
      prompt: "Put a defeated, helpless enemy in front of them and let the moment sit.",
      table: "character_actions_combat",
    },
    {
      prompt: "Let word of their ruthlessness reach someone before they arrive.",
      table: "legends",
    },
    {
      prompt: "Give them a target who's technically innocent but standing in the way.",
      table: "character_motivations",
    },
    {
      prompt: "Have an NPC try to appeal to a mercy they may not have.",
      table: "character_conversations",
    },
    {
      prompt: "Offer the efficient, ugly solution right next to the slower, cleaner one.",
      table: "dungeon",
    },
    {
      prompt: "Let their reputation open a door that kindness never would.",
      table: "noble_house",
    },
    {
      prompt: "Put them in charge of a decision the rest of the party doesn't want to make.",
      table: "character_identity",
    },
    {
      prompt: "Have the cost of their ruthlessness land on someone they actually care about.",
      table: "character_background",
    },
  ],
  Loyal: [
    {
      prompt: "Put the person they're loyal to in danger, and make helping costly.",
      table: "character_motivations",
    },
    {
      prompt: "Have someone question whether their loyalty is earned or just habit.",
      table: "character_conversations",
    },
    {
      prompt: "Offer a reward for betrayal that's genuinely tempting.",
      table: "plot_twists",
    },
    {
      prompt: "Let their loyalty be the thing an enemy tries to exploit.",
      table: "character_traits_flaws",
    },
    {
      prompt: "Put two loyalties in direct conflict with no clean answer.",
      table: "character_identity",
    },
    {
      prompt: "Have the person they're loyal to make a call they privately disagree with.",
      table: "character_conversations",
    },
    {
      prompt: "Let their steadfastness be exactly what holds the group together under pressure.",
      table: "adventure_tone",
    },
    {
      prompt: "Give them a chance to vouch for someone else at personal cost.",
      table: "character_background",
    },
    {
      prompt: "Have an old bond resurface and ask something of them.",
      table: "legends",
    },
    {
      prompt: "Put them in a position to protect someone who doesn't know they're doing it.",
      table: "character_actions_general",
    },
  ],
  Sneaky: [
    {
      prompt: "Offer a locked, guarded, or watched objective that force would ruin.",
      table: "dungeon",
    },
    {
      prompt: "Let them overhear something by being somewhere they technically shouldn't be.",
      table: "character_conversations",
    },
    {
      prompt: "Put a guard, patrol, or ward in their path that punishes noise, not strength.",
      table: "dungeon_traps",
    },
    {
      prompt: "Have someone almost catch them, and let the near-miss matter.",
      table: "plot_twists",
    },
    {
      prompt: "Give them a reason to move through a space unseen rather than through it.",
      table: "terrain",
    },
    {
      prompt: "Let their stealth be the only thing that keeps a situation from going loud.",
      table: "creature_abilities",
    },
    {
      prompt: "Offer information only obtainable by not being noticed getting it.",
      table: "cryptic_message",
    },
    {
      prompt: "Have a suspicious NPC start watching them specifically.",
      table: "character_traits_flaws",
    },
    {
      prompt:
        "Put a valuable, well-hidden thing somewhere only patience and quiet would find it.",
      table: "scavenging_results",
    },
    {
      prompt: "Let them slip away from a conversation no one else could have left.",
      table: "character_actions_general",
    },
  ],
  Scholarly: [
    {
      prompt: "Put a puzzle, text, or artifact in front of them that only their knowledge can unlock.",
      table: "cryptic_message",
    },
    {
      prompt: "Have an NPC dismiss expertise that turns out to matter enormously.",
      table: "character_conversations",
    },
    {
      prompt: "Offer a library, archive, or ruin worth actually spending time in.",
      table: "legends",
    },
    {
      prompt: "Let a piece of obscure knowledge they have be the thing that saves someone.",
      table: "spell_effects",
    },
    {
      prompt: "Give them a theory to test, and let the world push back on it.",
      table: "powers",
    },
    {
      prompt: "Put a specialist who out-knows them in the room, and let them react to that.",
      table: "character_identity",
    },
    {
      prompt:
        "Have a dangerous creature or phenomenon behave exactly as some old text predicted.",
      table: "creature_descriptors",
    },
    {
      prompt: "Offer a translation, cipher, or inscription nobody else in the party can read.",
      table: "names",
    },
    {
      prompt: "Let their research turn up an answer nobody wanted.",
      table: "plot_twists",
    },
    {
      prompt: "Give them a chance to teach someone something, and see how that lands.",
      table: "character_conversations",
    },
  ],
  Stubborn: [
    {
      prompt:
        "Have every reasonable voice in the room push them toward a decision they don't want to make.",
      table: "character_conversations",
    },
    {
      prompt:
        "Let their refusal to budge be exactly the thing that saves the day - or nearly ruins it.",
      table: "plot_twists",
    },
    {
      prompt: "Offer a graceful way to back down and let them not take it.",
      table: "character_traits_flaws",
    },
    {
      prompt: "Put someone equally stubborn directly across from them.",
      table: "character_identity",
    },
    {
      prompt: "Give them a promise or position from earlier that's now inconvenient to keep.",
      table: "legends",
    },
    {
      prompt: "Have an ally try - and fail - to talk them out of something.",
      table: "character_conversations",
    },
    {
      prompt: "Let the cost of holding their ground be visible before they pay it.",
      table: "adventure_tone",
    },
    {
      prompt: "Offer a compromise that technically works but that they'd never accept.",
      table: "character_motivations",
    },
    {
      prompt: "Put them in charge of a call where changing course would be the smart move.",
      table: "dungeon",
    },
    {
      prompt: "Have their persistence wear down an obstacle nothing else could.",
      table: "dungeon_traps",
    },
  ],
  Optimistic: [
    {
      prompt: "Put them in a scene that's gone badly for everyone else and let their outlook be tested.",
      table: "adventure_tone",
    },
    {
      prompt: "Have a cynical NPC challenge their hope directly, to their face.",
      table: "character_conversations",
    },
    {
      prompt: "Let their belief that things will work out be the thing that actually rallies someone.",
      table: "character_motivations",
    },
    {
      prompt: "Offer a bleak situation with one small, easy-to-miss silver lining.",
      table: "plot_twists",
    },
    {
      prompt: "Give them a companion who's given up, and see if they can talk them back.",
      table: "character_traits_flaws",
    },
    {
      prompt: "Let their optimism be proven right in a moment that really needed it.",
      table: "legends",
    },
    {
      prompt:
        "Put a genuinely hopeless-looking obstacle in front of the party and see how they frame it.",
      table: "dungeon",
    },
    {
      prompt: "Have someone take advantage of their trust in a good outcome.",
      table: "character_identity",
    },
    {
      prompt: "Offer a small win worth celebrating in the middle of a hard stretch.",
      table: "sounds",
    },
    {
      prompt: "Let their hope be the thing a frightened NPC needed to hear.",
      table: "character_conversations",
    },
  ],

  // ===== Wish tags =====
  "Epic battles": [
    {
      prompt: "Escalate the next fight into something with real scale - numbers, terrain, or stakes bigger than a skirmish.",
      table: "army",
    },
    {
      prompt: "Introduce a named, formidable enemy worth building an actual fight around.",
      table: "creature_descriptors",
    },
    {
      prompt: "Give the next battlefield a dramatic backdrop - a collapsing structure, a storm, a burning city.",
      table: "terrain",
    },
    {
      prompt: "Let a battle turn on a single dramatic moment, not just accumulated damage.",
      table: "plot_twists",
    },
    {
      prompt: "Bring in reinforcements, allies, or a rival army to widen the scope of the next fight.",
      table: "army",
    },
    {
      prompt: "Introduce a powerful, memorable weapon or ability that could turn a fight.",
      table: "powers",
    },
    {
      prompt: "Set up a siege, defense, or last-stand scenario worth preparing for.",
      table: "dungeon",
    },
    {
      prompt: "Let a creature with a genuinely dangerous ability show up and force real tactics.",
      table: "creature_abilities",
    },
    {
      prompt: "Give an upcoming fight a ticking clock or collapsing environment to raise the stakes.",
      table: "dungeon_traps",
    },
    {
      prompt: "Put them face-to-face with an opponent whose reputation alone raises the tension.",
      table: "legends",
    },
  ],
  "Deep roleplay": [
    {
      prompt: "Give an NPC a real, specific want that only comes out in a one-on-one conversation.",
      table: "character_motivations",
    },
    {
      prompt: "Slow a scene down and let a conversation matter more than any roll.",
      table: "character_conversations",
    },
    {
      prompt: "Bring back an NPC with unfinished emotional business from earlier.",
      table: "character_background",
    },
    {
      prompt: "Offer a quiet, unhurried moment between characters with nothing mechanical riding on it.",
      table: "character_identity",
    },
    {
      prompt: "Let an NPC ask them a question that's hard to answer honestly.",
      table: "character_conversations",
    },
    {
      prompt: "Give a side character enough personality that talking to them feels worth it.",
      table: "character_personality",
    },
    {
      prompt: "Put two characters with history in the same room and let old business surface.",
      table: "character_traits_flaws",
    },
    {
      prompt: "Offer a chance for a character to say something they've been avoiding saying.",
      table: "cryptic_message",
    },
    {
      prompt: "Let an NPC's own flaw or fear color how they respond to the party.",
      table: "character_traits_flaws",
    },
    {
      prompt: "Give a relationship room to shift - warmer, colder, or more complicated - through dialogue alone.",
      table: "character_conversations",
    },
  ],
  "Mystery & secrets": [
    {
      prompt: "Plant a clue that only makes sense once combined with something they already know.",
      table: "cryptic_message",
    },
    {
      prompt: "Have an NPC lie convincingly, and leave one small tell for later.",
      table: "character_conversations",
    },
    {
      prompt: "Reveal a piece of a lore secret without giving away the whole picture.",
      table: "legends",
    },
    {
      prompt: "Let two known facts contradict each other and leave it unresolved for now.",
      table: "plot_twists",
    },
    {
      prompt: "Introduce an object, symbol, or mark whose meaning isn't explained yet.",
      table: "magic_item",
    },
    {
      prompt: "Have someone react to a name or place with more fear or familiarity than makes sense yet.",
      table: "names",
    },
    {
      prompt: "Drop a locked door, sealed record, or forbidden topic that's clearly hiding something.",
      table: "dungeon",
    },
    {
      prompt: "Let a minor NPC know more than they're letting on.",
      table: "character_background",
    },
    {
      prompt: "Introduce a rumor that's almost - but not quite - true.",
      table: "legends",
    },
    {
      prompt: "Give them a partial answer that raises a bigger question than the one they asked.",
      table: "cryptic_message",
    },
  ],
  Exploration: [
    {
      prompt: "Reveal a striking, unexpected location worth actually stopping to take in.",
      table: "terrain",
    },
    {
      prompt: "Give them a map, landmark, or horizon that promises somewhere new.",
      table: "locations",
    },
    {
      prompt: "Let curiosity about the world - not a quest requirement - pull them somewhere.",
      table: "forest",
    },
    {
      prompt: "Introduce a strange settlement, ruin, or structure that begs a closer look.",
      table: "city",
    },
    {
      prompt: "Offer a fork in the road with no clear 'correct' answer, just different unknowns.",
      table: "dungeon",
    },
    {
      prompt: "Put an unusual creature or phenomenon in view, purely as a sign there's more out there.",
      table: "creature_descriptors",
    },
    {
      prompt: "Give them a reason to go somewhere the main plot doesn't strictly require.",
      table: "civilization",
    },
    {
      prompt: "Let the environment itself tell a story - ruins, weather, terrain that hints at history.",
      table: "legends",
    },
    {
      prompt: "Introduce a new region, culture, or people worth spending a scene on for its own sake.",
      table: "noble_house",
    },
    {
      prompt: "Offer a vista, vantage point, or discovery that rewards exploration with pure atmosphere.",
      table: "adventure_tone",
    },
  ],
  Romance: [
    {
      prompt: "Give a romantic NPC a reason to seek them out, not just be sought.",
      table: "character_conversations",
    },
    {
      prompt: "Offer a quiet moment alone together with no urgent plot pressing in.",
      table: "character_identity",
    },
    {
      prompt: "Let jealousy, a rival suitor, or an old flame complicate things.",
      table: "character_background",
    },
    {
      prompt: "Put a small, low-stakes gesture in play - a gift, a favor, an invitation.",
      table: "objects",
    },
    {
      prompt: "Have an NPC's feelings show through action rather than a direct declaration.",
      table: "character_motivations",
    },
    {
      prompt: "Offer a choice between duty and someone they care about, without making it a trap.",
      table: "plot_twists",
    },
    {
      prompt: "Let a shared danger create an unplanned moment of closeness.",
      table: "adventure_tone",
    },
    {
      prompt: "Give the relationship an obstacle that isn't a villain - distance, misunderstanding, timing.",
      table: "character_traits_flaws",
    },
    {
      prompt: "Let an NPC be visibly nervous or awkward around them, for once.",
      table: "character_conversations",
    },
    {
      prompt: "Offer a milestone moment - a confession, a first real date, a turning point - worth slowing down for.",
      table: "character_identity",
    },
  ],
  "Laughs & chaos": [
    {
      prompt: "Introduce a minor NPC who's a complete, delightful mess.",
      table: "character_traits_flaws",
    },
    {
      prompt: "Let a simple plan go comically, harmlessly sideways.",
      table: "plot_twists",
    },
    {
      prompt: "Put an absurd creature or situation in their path with low real stakes.",
      table: "creature_descriptors",
    },
    {
      prompt: "Offer a chance for a bit or running joke to escalate.",
      table: "adventure_tone",
    },
    {
      prompt: "Have an NPC take something very seriously that really shouldn't be taken seriously.",
      table: "character_personality",
    },
    {
      prompt: "Introduce a chaotic animal, crowd, or event that derails the scene in a fun way.",
      table: "animal_actions",
    },
    {
      prompt: "Let a roll's consequence be silly rather than grim, when the stakes allow it.",
      table: "scavenging_results",
    },
    {
      prompt: "Offer an over-the-top NPC with a ridiculous but harmless obsession.",
      table: "character_identity",
    },
    {
      prompt: "Give them an easy win that comes with a genuinely funny complication.",
      table: "character_actions_general",
    },
    {
      prompt: "Let something mundane go hilariously wrong at the worst comedic moment.",
      table: "sounds",
    },
  ],
  "Dark & gritty": [
    {
      prompt: "Let a victory cost something real - resources, trust, or a piece of someone's conscience.",
      table: "plot_twists",
    },
    {
      prompt: "Introduce an NPC who's compromised by desperation, not villainy.",
      table: "character_motivations",
    },
    {
      prompt: "Give them a choice where every option is genuinely bad.",
      table: "curses",
    },
    {
      prompt: "Let the environment itself feel worn down, dangerous, and unforgiving.",
      table: "dungeon",
    },
    {
      prompt: "Show the aftermath of violence honestly instead of skipping past it.",
      table: "character_descriptors",
    },
    {
      prompt: "Introduce scarcity - of supplies, allies, or good options.",
      table: "scavenging_results",
    },
    {
      prompt: "Let an authority or institution be part of the problem, not the solution.",
      table: "civilization",
    },
    {
      prompt: "Give an enemy an understandable, even sympathetic reason for what they're doing.",
      table: "character_background",
    },
    {
      prompt: "Let consequences from an earlier hard choice resurface unresolved.",
      table: "legends",
    },
    {
      prompt: "Put them somewhere the danger is mundane and human, not monstrous.",
      table: "city",
    },
  ],
  "Political intrigue": [
    {
      prompt: "Introduce a faction whose public and private goals don't match.",
      table: "civilization",
    },
    {
      prompt: "Let an ally have their own agenda that only partly overlaps with the party's.",
      table: "character_motivations",
    },
    {
      prompt: "Offer information that's valuable to one side and dangerous to hold.",
      table: "cryptic_message",
    },
    {
      prompt: "Put them in a room where every alliance in play is provisional.",
      table: "noble_house",
    },
    {
      prompt: "Let a favor granted now come with an unstated future cost.",
      table: "character_conversations",
    },
    {
      prompt: "Introduce a rival power maneuvering just outside their view.",
      table: "army",
    },
    {
      prompt: "Give them a chance to play two factions against each other.",
      table: "character_identity",
    },
    {
      prompt: "Let a public event (a court, a council, a ceremony) be the real battlefield.",
      table: "noble_house",
    },
    {
      prompt: "Offer a secret whose reveal would reshape the balance of power.",
      table: "legends",
    },
    {
      prompt: "Put loyalty and ambition in direct, personal conflict for one specific NPC.",
      table: "character_traits_flaws",
    },
  ],
  "Becoming powerful": [
    {
      prompt: "Offer a genuine, risky opportunity to grow stronger, with a real cost attached.",
      table: "powers",
    },
    {
      prompt: "Let them notice, concretely, how much less a past obstacle would trouble them now.",
      table: "spell_effects",
    },
    {
      prompt: "Introduce a mentor, rival, or path that could take their growth further.",
      table: "character_identity",
    },
    {
      prompt: "Give them a taste of what greater power in this world actually costs its holders.",
      table: "curses",
    },
    {
      prompt: "Put a source of real strength - an artifact, a rite, forbidden knowledge - just out of easy reach.",
      table: "magic_item",
    },
    {
      prompt: "Let an old threat become trivial, and let that shift land narratively, not just mechanically.",
      table: "creature_descriptors",
    },
    {
      prompt: "Introduce someone who fears what they might become as they grow stronger.",
      table: "character_conversations",
    },
    {
      prompt: "Offer a test or trial specifically designed to measure how far they've come.",
      table: "dungeon",
    },
    {
      prompt: "Let their growing reputation start to precede them into new places.",
      table: "legends",
    },
    {
      prompt: "Give them a choice about how to use new power, before the story does it for them.",
      table: "plot_twists",
    },
  ],
  "Horror & tension": [
    {
      prompt: "Let something be wrong before anyone can say exactly what.",
      table: "sounds",
    },
    {
      prompt: "Introduce a threat that can't be fought head-on, only survived or avoided.",
      table: "undead",
    },
    {
      prompt: "Use silence, absence, or stillness where noise and motion were expected.",
      table: "smells",
    },
    {
      prompt: "Let a safe place stop feeling safe, gradually and without a clear trigger.",
      table: "domicile",
    },
    {
      prompt: "Introduce a body, a message, or a scene that implies horror without showing it outright.",
      table: "cryptic_message",
    },
    {
      prompt: "Give them a countdown they can feel but not fully see the shape of.",
      table: "curses",
    },
    {
      prompt: "Let a familiar NPC behave just slightly wrong.",
      table: "mutation",
    },
    {
      prompt: "Introduce an environment that actively resists being understood - shifting, wrong angles, impossible geography.",
      table: "cavern",
    },
    {
      prompt: "Let a monster's presence be felt (tracks, damage, dread) well before it's seen.",
      table: "creature_descriptors",
    },
    {
      prompt: "Offer a moment of false safety right before the real scare.",
      table: "visions_dreams",
    },
  ],
  "Found family": [
    {
      prompt: "Let an NPC companion do something that shows they'd genuinely go to bat for the party.",
      table: "character_motivations",
    },
    {
      prompt: "Give the group a quiet, low-stakes shared moment - a meal, a joke, downtime together.",
      table: "character_conversations",
    },
    {
      prompt: "Threaten someone the party has grown to care about, and let that matter more than the threat itself.",
      table: "character_background",
    },
    {
      prompt: "Let a companion open up about something personal, unprompted.",
      table: "character_identity",
    },
    {
      prompt: "Offer a chance for the party to protect one of their own at real cost.",
      table: "character_actions_general",
    },
    {
      prompt: "Let an outsider notice - and comment on - how tight-knit the group has become.",
      table: "character_conversations",
    },
    {
      prompt: "Give a companion a moment to step up in a way that surprises the party.",
      table: "character_traits_flaws",
    },
    {
      prompt: "Let a shared history or inside joke resurface naturally.",
      table: "legends",
    },
    {
      prompt: "Offer a homecoming or gathering moment where the found family gets to just be together.",
      table: "domicile",
    },
    {
      prompt: "Let a companion's loyalty be tested, and have them choose the party anyway.",
      table: "character_motivations",
    },
  ],
  "Moral dilemmas": [
    {
      prompt: "Offer a choice with no clean option, where every path costs someone something real.",
      table: "plot_twists",
    },
    {
      prompt: "Let doing the right thing conflict directly with doing the smart thing.",
      table: "character_motivations",
    },
    {
      prompt: "Introduce an NPC whose goals are sympathetic but whose methods aren't.",
      table: "character_background",
    },
    {
      prompt: "Give them power over someone else's fate, with no easy answer for what to do with it.",
      table: "curses",
    },
    {
      prompt: "Let a past choice's consequences resurface and demand a second decision.",
      table: "legends",
    },
    {
      prompt: "Offer a rule or promise that's right in principle but harmful to keep in this specific case.",
      table: "civilization",
    },
    {
      prompt: "Put two people they care about on opposite sides of the same problem.",
      table: "character_identity",
    },
    {
      prompt: "Let mercy and justice point in different directions for the same act.",
      table: "character_conversations",
    },
    {
      prompt: "Offer a solution that saves the many at a real cost to the few.",
      table: "army",
    },
    {
      prompt: "Give them information that would hurt someone to know, and let them decide whether to share it.",
      table: "cryptic_message",
    },
  ],
};

/**
 * Deterministic-shape-friendly (Fisher-Yates partial shuffle) random sample
 * of `count` distinct examples for a tag, without replacement. Returns
 * fewer than `count` only if the tag's pool itself has fewer entries (never
 * happens today - every tag has exactly 10 - but this stays correct if that
 * changes). Returns [] for an unknown tag rather than throwing, since tags
 * are free text from older saves in principle.
 */
export function pickTagFocusExamples(
  tag: string,
  count: number = 3,
): TagFocusExample[] {
  const pool = TAG_FOCUS_EXAMPLES[tag];
  if (!pool || pool.length === 0) return [];

  const indices = pool.map((_, i) => i);
  const n = Math.min(count, indices.length);
  const picked: TagFocusExample[] = [];
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (indices.length - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
    picked.push(pool[indices[i]]);
  }
  return picked;
}

/** All tags with a curated example bank - PERSONALITY_TAGS + WISH_TAGS from GuidedStoryStart.tsx. */
export const ALL_TAG_FOCUS_NAMES: string[] = Object.keys(TAG_FOCUS_EXAMPLES);
