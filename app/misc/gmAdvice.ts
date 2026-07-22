/**
 * GM Advice: curated, mid-play-actionable facilitation tips (condensed from a
 * TTRPG game-mastery research compendium) plus the Robin Laws player-archetype
 * taxonomy. Two independent features share this file because both are pure,
 * static "GM guidance" data with no dependency on live StoryData beyond a
 * couple of flags.
 *
 * Session-Zero and pre-session-prep advice is deliberately excluded from
 * GM_ADVICE_TIPS - it isn't actionable once a scene has already loaded, which
 * is the only place this module's advice gets surfaced (increment_scene, see
 * toolExecutor.ts).
 */

import type { PlayerArchetype } from "@/app/misc/structs";

export const ARCHETYPE_INFO: Record<
  PlayerArchetype,
  { label: string; description: string; facilitation: string }
> = {
  power_gamer: {
    label: "Power Gamer",
    description: "Acquiring upgrades, optimizing stats, mechanical supremacy.",
    facilitation:
      "Give them clear progression paths, powerful loot, and challenges that reward optimized builds.",
  },
  butt_kicker: {
    label: "Butt-Kicker",
    description: "Direct, visceral combat to let off steam.",
    facilitation:
      "Ensure regular, straightforward combat encounters where they can deal massive damage.",
  },
  tactician: {
    label: "Tactician",
    description: "Solving problems by mastering the ruleset and outsmarting foes.",
    facilitation:
      "Design intricate battlefields and hazards, and respect their clever mechanical solutions.",
  },
  specialist: {
    label: "Specialist",
    description: "Executing one specific action or trope flawlessly.",
    facilitation:
      "Offer consistent, dedicated opportunities for their specific niche to shine.",
  },
  method_actor: {
    label: "Method Actor",
    description: "Embodying their character's personality, flaws, and drama.",
    facilitation:
      "Present deep moral dilemmas, complex NPCs, and scenarios that challenge their core beliefs.",
  },
  storyteller: {
    label: "Storyteller",
    description: "Advancing the overarching plot and a cohesive narrative arc.",
    facilitation:
      "Feed them lore, shifting political dynamics, and the long-term consequences of their actions.",
  },
  casual_gamer: {
    label: "Casual Gamer",
    description: "Socializing with friends, participating without leading the action.",
    facilitation:
      "Avoid forcing them into the spotlight; give them simple, supportive roles that keep them comfortably involved.",
  },
};

// "combat" tips only apply while a fight is active; "any" tips apply to any
// scene. There's no reliable deterministic signal for finer-grained buckets
// (social vs. exploration) at the increment_scene hook point, so this stays
// a two-way split rather than guessing from unstructured narration text.
export type GMAdviceContext = "combat" | "any";

export interface GMAdviceTip {
  id: number;
  category: string;
  context: GMAdviceContext;
  text: string;
}

// prettier-ignore
export const GM_ADVICE_TIPS: GMAdviceTip[] = [
  // --- Narrative Improvisation & Flow State ---
  { id: 1, category: "improv", context: "any", text: "Accept player declarations as true and build the world's logical reaction on top of them." },
  { id: 2, category: "improv", context: "any", text: "Don't feel pressured for an instant answer - pause, check your notes, or ask players for a moment." },
  { id: 3, category: "improv", context: "any", text: "Use \"No, but...\" to deny an impossible action while offering a viable alternative." },
  { id: 4, category: "improv", context: "any", text: "Treat player speculation as free plot material - if they guess a secret, consider making it true." },
  { id: 5, category: "improv", context: "any", text: "Keep improvisation consistent with what's already established about the world." },
  { id: 6, category: "improv", context: "any", text: "Frame a failed roll as bad luck or a competent foe, never the character's incompetence." },
  { id: 7, category: "improv", context: "any", text: "Fail forward: every failed roll should introduce a complication, not a dead end." },
  { id: 8, category: "improv", context: "any", text: "Use modular secrets - the same clue can surface wherever the players actually go looking." },
  { id: 9, category: "improv", context: "any", text: "Ask a leading question when you run out of details (\"what makes you uneasy here?\")." },
  { id: 10, category: "improv", context: "any", text: "Stay detached from your plans - if players skip or trivialize content, let the world adapt." },
  { id: 11, category: "improv", context: "any", text: "Let players define minor cultural or background details themselves to lighten your load." },
  { id: 12, category: "improv", context: "any", text: "If a player's guess about the world is more interesting than your plan, adopt it." },
  { id: 13, category: "improv", context: "any", text: "Keep a handful of sensory details on hand to drop into any improvised scene." },
  { id: 14, category: "improv", context: "any", text: "Turn \"is X here?\" questions back to the player to spark their creativity." },
  { id: 15, category: "improv", context: "any", text: "Use the environment itself as an active participant - wind, a candle, a passing cart." },
  { id: 16, category: "improv", context: "any", text: "An NPC doesn't need a funny voice - posture and word choice carry the personality." },
  { id: 17, category: "improv", context: "any", text: "If a scene stalls, introduce a sudden, logical disruption to force a decision." },
  { id: 18, category: "improv", context: "any", text: "Keep a few plug-and-play encounters ready for when players go off the mapped territory." },
  { id: 19, category: "improv", context: "any", text: "Limit improvised descriptions to two or three striking details and let imagination fill the rest." },
  { id: 20, category: "improv", context: "any", text: "Commit fully to improvised rulings - consistency matters more than perfection." },
  { id: 21, category: "improv", context: "any", text: "Use a beat of silence after a threat or revelation to let its weight land." },
  { id: 22, category: "improv", context: "any", text: "Note down every improvised NPC, location, or lore fact immediately to avoid contradictions later." },
  { id: 23, category: "improv", context: "any", text: "Break an improvised area into simple zones instead of needing a precise map." },
  { id: 24, category: "improv", context: "any", text: "Bring back minor past NPCs or consequences to make prior choices feel impactful." },
  { id: 25, category: "improv", context: "any", text: "Let a player justify a creative alternate skill for a check if it makes narrative sense." },
  { id: 26, category: "improv", context: "any", text: "Don't panic at a shortcut past prepared content - reward it and explore the fallout." },
  { id: 27, category: "improv", context: "any", text: "Use hard scene framing - cut straight to the interesting part, skip the travel." },
  { id: 28, category: "improv", context: "any", text: "Ask what the players are trying to achieve before they roll, not just what they physically do." },
  { id: 29, category: "improv", context: "any", text: "Let players describe the flair of their successes to share the narrative load." },
  { id: 30, category: "improv", context: "any", text: "End the scene with an active question: \"what do you do?\"" },

  // --- Pacing, Energy, and Scene Framing ---
  { id: 31, category: "pacing", context: "any", text: "Deliberately alternate upward beats (relief, triumph) with downward beats (tension, loss)." },
  { id: 32, category: "pacing", context: "any", text: "Track time until the next important choice - fast-forward once decisions stop happening." },
  { id: 33, category: "pacing", context: "any", text: "Use hard cuts to skip empty travel and land the party at the next real choice." },
  { id: 34, category: "pacing", context: "any", text: "Consider ending on a cliffhanger - cut right as a threat or revelation lands." },
  { id: 35, category: "pacing", context: "any", text: "Match description pace to urgency: punchy fragments in a chase, slower prose at rest." },
  { id: 36, category: "pacing", context: "any", text: "Cut away to what villains or rivals are doing \"meanwhile\" to build looming tension." },
  { id: 37, category: "pacing", context: "any", text: "Let pacing slow naturally for spontaneous in-character roleplay - don't rush it." },
  { id: 38, category: "pacing", context: "any", text: "Treat the current arc as a small, self-contained chapter with its own beginning and climax." },
  { id: 39, category: "pacing", context: "any", text: "Consider real-world urgency (a ticking countdown) for high-stakes escapes to add visceral tension." },
  { id: 40, category: "pacing", context: "any", text: "When energy dips, drop in a sudden environmental shift or NPC arrival." },
  { id: 41, category: "pacing", context: "any", text: "Keep shopping and mundane logistics off-screen unless they serve plot or character." },
  { id: 42, category: "pacing", context: "any", text: "If engagement seems to be flagging, wrap the scene rather than lingering." },
  { id: 43, category: "pacing", context: "any", text: "Think in three acts: hook, rising tension, brief resolution." },
  { id: 44, category: "pacing", context: "any", text: "Use slow-motion description at pivotal moments to give them narrative weight." },
  { id: 45, category: "pacing", context: "any", text: "Resolve long downtime or travel as a quick montage rather than playing it out beat by beat." },
  { id: 46, category: "pacing", context: "any", text: "Don't run back-to-back identical encounter types; alternate combat, social, and puzzle beats." },
  { id: 47, category: "pacing", context: "any", text: "If players over-plan a simple action, have the world react to the hesitation." },
  { id: 48, category: "pacing", context: "any", text: "Set a clear scene goal up front; once it's met or moot, cut to the next scene." },
  { id: 49, category: "pacing", context: "any", text: "Use a cutaway the characters can't see to add dramatic irony." },
  { id: 50, category: "pacing", context: "any", text: "Don't linger once no interesting choices remain - hand-wave the cleanup." },
  { id: 51, category: "pacing", context: "any", text: "Alternate hopeful and fearful beats to keep the emotional rhythm engaging." },
  { id: 52, category: "pacing", context: "any", text: "If a complex debate stalls things, summarize the options plainly to help reach a decision." },
  { id: 53, category: "pacing", context: "any", text: "Split focus with a secondary objective in high-stakes scenes (defeat the enemy vs. stop the rising water)." },
  { id: 54, category: "pacing", context: "any", text: "Keep travel description short and evocative - two vivid sentences beat a lecture." },
  { id: 55, category: "pacing", context: "any", text: "Preview what's coming next to keep excitement alive." },
  { id: 56, category: "pacing", context: "any", text: "Use silence and a quieter register to slow things down and force focus." },
  { id: 57, category: "pacing", context: "any", text: "If a scene turns unexpectedly unfun, look for a natural pause rather than pushing through it." },
  { id: 58, category: "pacing", context: "any", text: "Don't rush a climax - let it breathe rather than compressing it at the last second." },
  { id: 59, category: "pacing", context: "any", text: "Let weather or environment mirror the emotional stakes of the scene." },
  { id: 60, category: "pacing", context: "any", text: "Keep the spotlight moving - cut away from a solo scene at a tense moment." },

  // --- Dynamic NPC Portrayal ---
  { id: 61, category: "npc", context: "any", text: "Give every NPC one clear motivation that makes their behavior easy to play." },
  { id: 62, category: "npc", context: "any", text: "Anchor each NPC in one physical trait and one mannerism, not a paragraph." },
  { id: 63, category: "npc", context: "any", text: "Don't let two NPCs monologue at each other - summarize and return focus to the players." },
  { id: 64, category: "npc", context: "any", text: "Voice an NPC through pacing and word choice rather than a forced accent." },
  { id: 65, category: "npc", context: "any", text: "Show attitude through posture or action before the NPC even speaks." },
  { id: 66, category: "npc", context: "any", text: "Give major villains a self-justifying, coherent point of view." },
  { id: 67, category: "npc", context: "any", text: "Let NPCs react to the party's reputation and past deeds." },
  { id: 68, category: "npc", context: "any", text: "Keep a few signature NPCs with strong, conflicting opinions ready to present." },
  { id: 69, category: "npc", context: "any", text: "Give NPCs blind spots and biases - nobody should know everything." },
  { id: 70, category: "npc", context: "any", text: "Give an enemy group's leader a distinct trait to separate them from the rank and file." },
  { id: 71, category: "npc", context: "any", text: "Use a side character's fears or values as a mirror for the region's culture." },
  { id: 72, category: "npc", context: "any", text: "Let NPCs make mistakes, fall for lies, and feel real emotions." },
  { id: 73, category: "npc", context: "any", text: "Give NPCs simple, divisive relationships with each other for living local politics." },
  { id: 74, category: "npc", context: "any", text: "Keep a list of quick, setting-appropriate names ready for unplanned NPCs." },
  { id: 75, category: "npc", context: "any", text: "Never let a major NPC speak without purpose - reveal a secret, offer a hook, or build atmosphere." },
  { id: 76, category: "npc", context: "any", text: "Friendly NPCs should offer context and options, never dictate the player's choice." },
  { id: 77, category: "npc", context: "any", text: "Let NPCs change their stance over time based on the party's actions." },
  { id: 78, category: "npc", context: "any", text: "Give NPCs a discoverable secret or vulnerability for perceptive players to find." },
  { id: 79, category: "npc", context: "any", text: "Cap a new NPC's introduction to a couple of sentences." },
  { id: 80, category: "npc", context: "any", text: "Deliver prepared secrets or clues through NPC gossip, warnings, or confessions." },
  { id: 81, category: "npc", context: "any", text: "Show a high-status NPC's power through how others behave around them." },
  { id: 82, category: "npc", context: "any", text: "Give monsters distinct instincts and hunting behavior instead of treating them as static stat blocks." },
  { id: 83, category: "npc", context: "any", text: "Mention NPCs having a life off-screen to make the world feel independent of the party." },
  { id: 84, category: "npc", context: "any", text: "Let players' family, rivals, or friends as NPCs create instant emotional stakes." },
  { id: 85, category: "npc", context: "any", text: "Signal an NPC's lie with a non-verbal tell rather than stating it outright." },
  { id: 86, category: "npc", context: "any", text: "Don't make every merchant or official hostile - save betrayal for when it should shock." },
  { id: 87, category: "npc", context: "any", text: "Give recurring NPCs visible progression (scars, changes) between appearances." },
  { id: 88, category: "npc", context: "any", text: "Give an NPC's death narrative weight via its impact on those around them." },
  { id: 89, category: "npc", context: "any", text: "Use a tangible detail (a letter, a seal) for items an NPC hands over." },
  { id: 90, category: "npc", context: "any", text: "Treat NPCs as living actors invested in their own survival, not scenery." },

  // --- Immersive Descriptions & Spatial Awareness ---
  { id: 91, category: "description", context: "any", text: "Engage smell, sound, and touch, not just sight, in environment descriptions." },
  { id: 92, category: "description", context: "any", text: "Show danger through physical evidence (claw marks, shredded gear) rather than a label." },
  { id: 93, category: "description", context: "any", text: "Use simple relative zones (\"near the altar\", \"at the threshold\") for theater-of-mind scenes." },
  { id: 94, category: "description", context: "any", text: "Cap room descriptions to two or three striking details and let questions fill the rest." },
  { id: 95, category: "description", context: "any", text: "Use temperature and weather actively - biting wind, humid heat - to ground the scene." },
  { id: 96, category: "description", context: "any", text: "Show time passing through shifting light and activity, not just a stated clock time." },
  { id: 97, category: "description", context: "any", text: "Use worn textures and materials to imply a location's age and history silently." },
  { id: 98, category: "description", context: "any", text: "Give immediate spatial context on entry: exits, cover, nearest threat." },
  { id: 99, category: "description", context: "any", text: "Contrast a vast scale with one tiny, human-scale detail." },
  { id: 100, category: "description", context: "any", text: "Use animal or plant behavior (sudden silence, recoiling ivy) to hint at danger." },
  { id: 101, category: "description", context: "any", text: "Reward exploration with sensory clues about what's in the next room." },
  { id: 102, category: "description", context: "any", text: "Use lighting and shadow as a tactical element, not just atmosphere." },
  { id: 103, category: "description", context: "any", text: "Call out terrain height and barriers clearly to invite vertical, tactical movement." },
  { id: 104, category: "description", context: "any", text: "Add moving elements (a waterfall, a waterwheel, drifting steam) for kinetic life." },
  { id: 105, category: "description", context: "any", text: "Let architecture style silently signal who built a place and why." },
  { id: 106, category: "description", context: "any", text: "Show magic's physical side-effects (static hair, creeping frost) near its source." },
  { id: 107, category: "description", context: "any", text: "Base search results on how and where the character searched, not just the roll result." },
  { id: 108, category: "description", context: "any", text: "Add mundane clutter (half-eaten bread, spilled ink) to make spaces feel lived-in." },
  { id: 109, category: "description", context: "any", text: "Describe acoustic properties - echo, muffled curtains - for auditory atmosphere." },
  { id: 110, category: "description", context: "any", text: "Emphasize confinement and pressure sensations underground: stale air, damp chill." },
  { id: 111, category: "description", context: "any", text: "Use a deliberate color palette to set a scene's emotional tone." },
  { id: 112, category: "description", context: "any", text: "Re-anchor the party's physical position right after a chaotic event settles." },
  { id: 113, category: "description", context: "any", text: "Show wear on the characters' own gear after hard travel or a rough battle." },
  { id: 114, category: "description", context: "any", text: "Use smell to instantly convey a district's wealth or squalor." },
  { id: 115, category: "description", context: "any", text: "Describe machines or devices by motion, heat, and sound, not blueprint detail." },
  { id: 116, category: "description", context: "any", text: "Use air currents as a subtle geographic hint in underground tunnels." },
  { id: 117, category: "description", context: "any", text: "Make food and hospitality descriptions rich so rests feel earned and comforting." },
  { id: 118, category: "description", context: "any", text: "Emphasize verticality (a vanishing pebble, no impact sound) to sell real danger." },
  { id: 119, category: "description", context: "any", text: "Let a background-appropriate character notice a specialized detail with no roll needed." },
  { id: 120, category: "description", context: "any", text: "Close an environment description by re-grounding position and asking \"what do you do?\"" },

  // --- Tactical Combat Dynamics & Speed ---
  { id: 121, category: "combat", context: "combat", text: "Prioritize momentum and clarity over perfect rules compliance in combat." },
  { id: 122, category: "combat", context: "combat", text: "Keep a clear turn order and give the next player a heads-up when they're on deck." },
  { id: 123, category: "combat", context: "combat", text: "Frame every monster's turn as story, not a flat list of attacks." },
  { id: 124, category: "combat", context: "combat", text: "Add shifting hazards mid-fight (rising tide, spreading fire) to force adaptation." },
  { id: 125, category: "combat", context: "combat", text: "Skip playing out fights whose outcome is already decided - resolve minions in a beat." },
  { id: 126, category: "combat", context: "combat", text: "Telegraph a big monster attack a round ahead to create a real tactical choice." },
  { id: 127, category: "combat", context: "combat", text: "Use an average static damage value instead of rolling a stack of dice every hit." },
  { id: 128, category: "combat", context: "combat", text: "Call out interactive terrain (a chandelier rope, hot coals) players can use." },
  { id: 129, category: "combat", context: "combat", text: "Show a monster's remaining health through its behavior, not a number." },
  { id: 130, category: "combat", context: "combat", text: "Give monsters goals beyond \"fight to the death\" - steal, flee, take a hostage." },
  { id: 131, category: "combat", context: "combat", text: "Give spells and attacks visible, lasting effects on the battlefield itself." },
  { id: 132, category: "combat", context: "combat", text: "Keep turn narration brief and punchy - results first, then a quick image." },
  { id: 133, category: "combat", context: "combat", text: "Let monsters use lore-appropriate tactics - skirmishers flank, soldiers hold a line." },
  { id: 134, category: "combat", context: "combat", text: "Hand a finishing blow's description to the player who lands it." },
  { id: 135, category: "combat", context: "combat", text: "Favor theater-of-mind for minor fights; save a grid for real set-pieces." },
  { id: 136, category: "combat", context: "combat", text: "Keep combatants moving - use pushback, repositioning, and changing cover." },
  { id: 137, category: "combat", context: "combat", text: "Reward clever tactical plays (coordinated abilities, cover) with a real advantage." },
  { id: 138, category: "combat", context: "combat", text: "Bring in reinforcements dynamically if the party is trivializing a fight." },
  { id: 139, category: "combat", context: "combat", text: "If a player stalls on their turn, offer two or three concrete thematic options." },
  { id: 140, category: "combat", context: "combat", text: "Lean into visceral sound, smell, and texture to make skirmishes feel real." },
  { id: 141, category: "combat", context: "combat", text: "Move straight into action from exploration without a long, mechanical setup." },
  { id: 142, category: "combat", context: "combat", text: "Give bosses a unique action economy so they aren't swarmed by numbers alone." },
  { id: 143, category: "combat", context: "combat", text: "Use morale - most enemies flee or surrender once their leader falls or losses mount." },
  { id: 144, category: "combat", context: "combat", text: "Describe conditions (stunned, blinded) by their physical sensation, not just the label." },
  { id: 145, category: "combat", context: "combat", text: "Add bystanders, hostages, or fragile treasure to complicate tactical decisions." },
  { id: 146, category: "combat", context: "combat", text: "Keep turn order flowing with a clear, friendly prompt when it's someone's turn." },
  { id: 147, category: "combat", context: "combat", text: "Describe a miss as an active dodge or block, not just \"you miss.\"" },
  { id: 148, category: "combat", context: "combat", text: "Give the battleground at least one unique terrain feature." },
  { id: 149, category: "combat", context: "combat", text: "Transition to a post-combat beat immediately - breathing, quiet, the aftermath." },
  { id: 150, category: "combat", context: "combat", text: "Let a critical hit or fumble bend the fight's story rather than sanding it down." },

  // --- Rules Adjudication, Dice, and Failing Forward ---
  { id: 151, category: "rules", context: "any", text: "Favor narrative momentum over rules-accuracy mid-session; look up the exact text later." },
  { id: 152, category: "rules", context: "any", text: "State the stakes and difficulty before the dice hit the table." },
  { id: 153, category: "rules", context: "any", text: "Fail forward - a failed roll should complicate the scene, never dead-end it." },
  { id: 154, category: "rules", context: "any", text: "Only call for a roll when the outcome is genuinely uncertain and consequential." },
  { id: 155, category: "rules", context: "any", text: "Use graduated outcomes (strong success, success at a cost, failure) over pure pass-fail." },
  { id: 156, category: "rules", context: "any", text: "Keep spontaneous rulings consistent so players can predict the world's logic." },
  { id: 157, category: "rules", context: "any", text: "Treat the dice as a co-author - let a crit or fumble redirect the scene." },
  { id: 158, category: "rules", context: "any", text: "Break a wild stunt into simple sub-checks so the risk is clear before committing." },
  { id: 159, category: "rules", context: "any", text: "Allow a one-time rule-bending exception for a spectacular, narrative-fitting action." },
  { id: 160, category: "rules", context: "any", text: "Prefer a chain of small checks over one all-or-nothing roll for a big moment." },
  { id: 161, category: "rules", context: "any", text: "Grant background expertise automatically without a roll when it clearly fits the character." },
  { id: 162, category: "rules", context: "any", text: "Let a player justify a different, more fitting attribute or skill for a check." },
  { id: 163, category: "rules", context: "any", text: "When a rule call is ambiguous, favor player intent and the scene's drama." },
  { id: 164, category: "rules", context: "any", text: "Reserve hidden rolls for things the character wouldn't know the result of." },
  { id: 165, category: "rules", context: "any", text: "Own rules mistakes openly rather than quietly retconning them." },
  { id: 166, category: "rules", context: "any", text: "Table a rules debate with a temporary ruling and revisit it later." },
  { id: 167, category: "rules", context: "any", text: "Describe conditions with sensory language, not just their mechanical name." },
  { id: 168, category: "rules", context: "any", text: "Offer an \"ugly choice\" on a partial success so the player owns the complication." },
  { id: 169, category: "rules", context: "any", text: "Show a hazard's warning signs before calling for the saving throw." },
  { id: 170, category: "rules", context: "any", text: "Hold NPCs and monsters to the same mechanical rules as the players." },
  { id: 171, category: "rules", context: "any", text: "Use static or average values for traps and falling damage to keep danger fast-paced." },
  { id: 172, category: "rules", context: "any", text: "Weave a great roll's result into real lore or tactical advantage, not just a number." },
  { id: 173, category: "rules", context: "any", text: "Avoid retconning past outcomes unless a rule oversight truly breaks the game." },
  { id: 174, category: "rules", context: "any", text: "Match mechanical crunch to the scene's tone - tighter in a dungeon, looser in downtime." },
  { id: 175, category: "rules", context: "any", text: "Treat a dramatic failure as the seed of a memorable arc, not just a setback." },
  { id: 176, category: "rules", context: "any", text: "Let a well-argued, well-roleplayed case lower the difficulty before any roll is made." },
  { id: 177, category: "rules", context: "any", text: "Let an earned narrative payoff win over a one-point-short technicality." },
  { id: 178, category: "rules", context: "any", text: "Stay a host and storyteller first, not a rules-policing referee." },
  { id: 179, category: "rules", context: "any", text: "Clearly telegraph when a decision carries severe, lasting consequences before it's made." },
  { id: 180, category: "rules", context: "any", text: "Keep a quick mental note of DCs and conditions you've already set to stay consistent." },

  // --- Player Engagement & Spotlight Sharing ---
  { id: 181, category: "spotlight", context: "any", text: "Actively invite quiet players in - ask what their character is doing during a lull." },
  { id: 182, category: "spotlight", context: "any", text: "Mine what players have said or theorized for your next plot twist." },
  { id: 183, category: "spotlight", context: "any", text: "Weave character backstories into the main arc, not just isolated side quests." },
  { id: 184, category: "spotlight", context: "any", text: "Root for the players' wins - you're their biggest fan, not their opponent." },
  { id: 185, category: "spotlight", context: "any", text: "Ask open questions that surface a character's fears and relationships." },
  { id: 186, category: "spotlight", context: "any", text: "Invite players to define minor setting details for a sense of ownership." },
  { id: 187, category: "spotlight", context: "any", text: "Gently redirect the floor if one or two players dominate every decision." },
  { id: 188, category: "spotlight", context: "any", text: "Reward great roleplay and clever plans with real narrative benefits." },
  { id: 189, category: "spotlight", context: "any", text: "Create quiet scenes (a campfire, a long ride) for characters to bond without NPC interference." },
  { id: 190, category: "spotlight", context: "any", text: "Over-clue mysteries - it's better to give too much information than too little." },
  { id: 191, category: "spotlight", context: "any", text: "Present complex situations without suggesting a single \"correct\" answer." },
  { id: 192, category: "spotlight", context: "any", text: "Use character names, not player names, to keep the focus on the fiction." },
  { id: 193, category: "spotlight", context: "any", text: "Keep a solo scout's spotlight brief; cut back to the party at a tense beat." },
  { id: 194, category: "spotlight", context: "any", text: "Design a challenge around a specific character's niche skill, language, or trope." },
  { id: 195, category: "spotlight", context: "any", text: "Let the players enjoy piecing together a reveal - don't over-explain it." },
  { id: 196, category: "spotlight", context: "any", text: "Clarify what a character would actually perceive before they act on incomplete information." },
  { id: 197, category: "spotlight", context: "any", text: "Let a clever non-combat solution (stealth, diplomacy) succeed as well as a fight would." },
  { id: 198, category: "spotlight", context: "any", text: "Build milestones around party goals rather than only individual actions." },
  { id: 199, category: "spotlight", context: "any", text: "Vary session focus across combat, roleplay, and lore to fit different players' tastes." },
  { id: 200, category: "spotlight", context: "any", text: "Offer a struggling or distracted player a low-pressure role rather than pushing the spotlight on them." },
  { id: 201, category: "spotlight", context: "any", text: "Avoid mind-control or loss-of-agency effects on player characters without prior buy-in." },
  { id: 202, category: "spotlight", context: "any", text: "Use tangible details (a letter, a token) to make information-gathering feel real." },
  { id: 203, category: "spotlight", context: "any", text: "Give characters peaceful downtime beats so high-stakes moments hit harder by contrast." },
  { id: 204, category: "spotlight", context: "any", text: "Validate players' emotional reactions to big story beats." },
  { id: 205, category: "spotlight", context: "any", text: "Judge a scene's success by whether the players are engaged and enjoying it." },
  { id: 206, category: "spotlight", context: "any", text: "Let a player's declared intent, not just their literal words, guide how you narrate the outcome." },
  { id: 207, category: "spotlight", context: "any", text: "Give a shy player's character a moment where their specific trait is the one that matters." },
  { id: 208, category: "spotlight", context: "any", text: "Don't let a single dominant character's plan run unchallenged every scene - make room for others." },
  { id: 209, category: "spotlight", context: "any", text: "Treat a player going quiet as a cue to check in, not a cue to talk over them." },
  { id: 210, category: "spotlight", context: "any", text: "Close a satisfying arc with a beat that lets every present character react to it." },
];

// How many of the most recently shown tip ids to avoid repeating. Comfortably
// smaller than the pool so variety holds up over a long campaign without
// ever running out of eligible tips.
const ROTATION_WINDOW = 60;
// How many ids to keep on StoryData - a little more than the rotation window
// so the "recently shown" set is always a clean slice of it.
const MAX_SHOWN_IDS_TRACKED = 80;

export interface GMAdviceSelection {
  tips: GMAdviceTip[];
  updatedShownIds: number[];
}

/**
 * Picks 1-2 GM advice tips for the scene that's about to start. Pure - the
 * caller (toolExecutor.ts's increment_scene handler) is responsible for
 * persisting `updatedShownIds` back onto StoryData.shownGMAdviceIds.
 */
export function selectGMAdviceForScene(
  shownIds: number[] | undefined,
  combatActive: boolean,
): GMAdviceSelection {
  const pool = combatActive
    ? GM_ADVICE_TIPS
    : GM_ADVICE_TIPS.filter((t) => t.context === "any");

  const recentlyShown = new Set((shownIds || []).slice(-ROTATION_WINDOW));
  let candidates = pool.filter((t) => !recentlyShown.has(t.id));
  if (candidates.length < 2) candidates = pool; // Pool exhausted - allow repeats rather than stalling.

  const remaining = [...candidates];
  const picked: GMAdviceTip[] = [];
  const count = Math.min(2, remaining.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * remaining.length);
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
  }

  const updatedShownIds = [...(shownIds || []), ...picked.map((t) => t.id)].slice(
    -MAX_SHOWN_IDS_TRACKED,
  );

  return { tips: picked, updatedShownIds };
}

/**
 * Formats picked tips as an internal-only note for the GM tool-response
 * message (see increment_scene in toolExecutor.ts) - never quoted verbatim
 * to the player, same "render it, don't name it" convention as director
 * moves.
 */
export function formatGMAdviceNote(tips: GMAdviceTip[]): string {
  if (!tips.length) return "";
  return `\n💡 GM Advice for this scene (internal guidance - weave it in naturally, never mention this note or quote it to the player):\n${tips
    .map((t) => `- ${t.text}`)
    .join("\n")}`;
}
