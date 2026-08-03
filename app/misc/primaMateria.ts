/**
 * Prima Materia - an alchemical oracle (Man Alone / Dice Nest, Dec 2025).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PROVENANCE / LICENSING - READ BEFORE SHIPPING PUBLICLY
 *
 * The mechanics in this file (three dice, a relational grammar, Frames,
 * Tint) are transcribed from a commercial product this project does not
 * own. The archetype and relation *sets* are arguably uncopyrightable
 * single words, but the appendix word lists at the bottom of this file
 * (dispositions, actions, landmarks, names, complications, quest prompts,
 * quick plucks) are verbatim creative expression from the book and are
 * reproduced here WITHOUT permission.
 *
 * This is deliberate and explicitly authorised for the alpha, where the
 * app is private and unreleased. It is NOT cleared for public release.
 * Before this ships to anyone outside the project, one of:
 *   1. get written permission from Man Alone / Dice Nest, or
 *   2. strip PRIMA_MATERIA_PLUCK_TABLES and let users import their own
 *      copy as `type: "table"` notes (the OCR importer and notes library
 *      already support exactly this), or
 *   3. replace the appendix lists with originally-authored equivalents.
 * The engine below works unchanged under all three - only the table data
 * at the bottom is encumbered. See docs/prima-materia.md.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Why this exists alongside mythic.ts: Mythic's meaning tables hand the
 * model an *untyped* word pair ("Abandon / Intrigues") and leave it to
 * invent both the relationship between the two words and the layer of
 * fiction they apply to. Prima Materia hands it a typed prompt with the
 * operator already fixed by the dice - `Knowledge against Spirit` - plus a
 * polarity per concept and an engine-chosen Frame. Fewer degrees of
 * interpretive freedom is the whole point: free interpretation is where an
 * LLM GM reverts to its defaults.
 *
 * Everything here is deterministic engine state. The model reads Tint and
 * Frame, it never sets them - the same contract `tension` and the director
 * move menu already use.
 */

import type { StoryData } from "./structs";

// ---------------------------------------------------------------------------
// Core symbol sets
// ---------------------------------------------------------------------------

export type Archetype =
  | "Fortune"
  | "Body"
  | "Knowledge"
  | "Safety"
  | "Mind"
  | "Spirit"
  | "Freedom"
  | "Nature"
  | "Calm"
  | "Connection"
  | "Society"
  | "Self";

/**
 * Face order of the two d12s.
 *
 * This is NOT the order the book's Quick Reference sheet prints the
 * archetypes in (that sheet lays them out as a 4x3 grid). It's that grid
 * read *column-wise*, which is the order the appendix Pluck tables are
 * actually indexed by - verified against three separate tables (Actions
 * row 3 = Knowledge: "Appraise, Examine, Analyze..."; NPC Reactions row 9
 * = Calm: "Patient, Relaxed, Unhurried..."; row 1 = Fortune in both).
 * Getting this wrong would silently misindex every 12x12 table below, so
 * `tests/primaMateria.test.ts` pins a few known cells.
 */
export const ARCHETYPE_ORDER: readonly Archetype[] = [
  "Fortune",
  "Body",
  "Knowledge",
  "Safety",
  "Mind",
  "Spirit",
  "Freedom",
  "Nature",
  "Calm",
  "Connection",
  "Society",
  "Self",
] as const;

/** Which die a symbol was read from - the bright principle or the shadow one. */
export type Polarity = "sol" | "nox";

export type Relation =
  | "within"
  | "against"
  | "from"
  | "toward"
  | "over"
  | "between";

export const RELATION_ORDER: readonly Relation[] = [
  "within",
  "against",
  "from",
  "toward",
  "over",
  "between",
] as const;

/**
 * The book's own grouping: Celestial relations correlate positively (the
 * two concepts align, work together, agree), Chthonic ones negatively
 * (they're at odds, in tension, separate). Handed to the model as a plain
 * hint so it doesn't have to guess whether `Fortune from Safety` is a gift
 * or a cost.
 */
export type RelationGroup = "celestial" | "chthonic";

export const RELATION_GROUP: Record<Relation, RelationGroup> = {
  within: "celestial",
  between: "celestial",
  toward: "celestial",
  against: "chthonic",
  from: "chthonic",
  over: "chthonic",
};

/** Keyword sets from the book's Quick Reference sheet, verbatim. */
export const SOL_KEYWORDS: Record<Archetype, string> = {
  Fortune: "luck, timing, treasure, prophecy, wish, favor, reward, coincidence",
  Body: "health, strength, motion, endurance, sensation, labor, presence",
  Knowledge:
    "information, insight, evidence, memory, understanding, learning, awareness",
  Safety: "protection, shelter, stability, security, refuge, assurance, control",
  Mind: "thought, focus, clarity, planning, reasoning, intention, attention",
  Spirit: "faith, meaning, resolve, hope, conviction, purpose, belief",
  Freedom:
    "choice, agency, movement, independence, escape, possibility, initiative",
  Nature:
    "environment, surroundings, weather, growth, cycles, essence, terrain",
  Calm: "rest, stillness, patience, quiet, balance, recovery, peace",
  Connection:
    "bond, communication, alliance, trust, cooperation, relationship, contact",
  Society: "community, culture, order, roles, institutions, norms, belonging",
  Self: "identity, agency, desire, integrity, choice, ownership, voice",
};

export const NOX_KEYWORDS: Record<Archetype, string> = {
  Fortune: "gamble, risk, chance, loss, debt, misfortune, uncertainty",
  Body: "injury, fatigue, pain, limitation, hunger, illness, vulnerability",
  Knowledge:
    "secrets, misinformation, ignorance, distortion, gaps, lies, confusion",
  Safety: "threat, exposure, danger, instability, pressure, fear, precarity",
  Mind: "doubt, anxiety, obsession, distraction, bias, fear, fixation",
  Spirit:
    "despair, guilt, emptiness, doubt, temptation, crisis, disillusionment",
  Freedom: "constraint, pursuit, exile, instability, lawlessness, consequence",
  Nature:
    "disaster, decay, wilderness, physics, exposure, forces, inevitability",
  Calm: "stagnation, suppression, numbness, delay, avoidance, inertia, silence",
  Connection:
    "entanglement, obligation, dependence, exposure, leverage, conflict, expectation",
  Society:
    "pressure, hierarchy, surveillance, conformity, control, politics, exclusion",
  Self: "ego, shame, isolation, doubt, denial, fear, self-conflict",
};

export function keywordsFor(
  archetype: Archetype,
  polarity: Polarity
): string {
  return polarity === "sol"
    ? SOL_KEYWORDS[archetype]
    : NOX_KEYWORDS[archetype];
}

// ---------------------------------------------------------------------------
// Frames - where you're standing when you read the result
// ---------------------------------------------------------------------------

export type Frame = "literal" | "personal" | "structural";

export const FRAME_INFO: Record<
  Frame,
  { label: string; scope: string; guidance: string }
> = {
  literal: {
    label: "Literal",
    scope: "Physical world & immediate events",
    guidance:
      "Read the result as concrete conditions in the scene right now: objects, terrain, weather, movement, threats, visible action. What is physically happening in this space?",
  },
  personal: {
    label: "Personal",
    scope: "Character psychology & motivation",
    guidance:
      "Read the result as what is happening inside a character: fear, desire, doubt, resolve, obsession, trust. Apply it to thought, emotion, impulse or decision-making.",
  },
  structural: {
    label: "Structural",
    scope: "Factions, systems & campaign movement",
    guidance:
      "Read the result as forces larger than any one character shifting: guilds, nations, religions, armies, ecosystems, economies, cults, long-term plots. You are observing movement across the map, not a single moment.",
  },
};

/**
 * Pick the Frame deterministically from live state, the same way
 * `selectDirectorMove` picks a move - the engine decides *where the model
 * is standing* when it reads an oracle result, and the model only does the
 * interpreting. Left to the model, this collapses: an unframed oracle
 * result gets narrated as generic atmosphere, which is the exact failure
 * this is here to close.
 *
 * The book's own selection rule is already a state machine, and it maps
 * cleanly onto signals this app already tracks:
 *   "if the scene is stalled -> Literal"        (nothing in motion)
 *   "if a character is uncertain -> Personal"   (people in play)
 *   "if the world is shifting -> Structural"    (threads/timers moving)
 *
 * Priority is most-concrete-first: what's physically happening right now
 * outranks what the world is doing, which outranks interiority. The final
 * fallback is Literal because a genuinely stalled scene is exactly the
 * case the book says wants concrete physical detail.
 */
export function selectFrame(storyData: StoryData): Frame {
  // Combat or a challenge in progress: the fiction is physical and
  // immediate, whatever else is true elsewhere.
  if (storyData.combatState?.active || storyData.activeChallenge) {
    return "literal";
  }

  const activeThreads = (storyData.threads || []).filter(
    (t) => t.status === "active"
  );
  const activeTimers = (storyData.timers || []).filter(
    (t) => t.status === "active"
  );

  // The world is visibly in motion - a deadline running, or enough open
  // plotlines that the macro layer is doing something on its own.
  if (activeTimers.length > 0 || activeThreads.length >= 2) {
    return "structural";
  }

  // People are in play and the scene is about them.
  const npcs = storyData.npcs || [];
  if (npcs.length > 0) {
    return "personal";
  }

  return "literal";
}

// ---------------------------------------------------------------------------
// Tint - the persistent tonal register (the book's "meta-layer")
// ---------------------------------------------------------------------------

export type Tint = "day" | "neutral" | "night";

export const TINT_INFO: Record<Tint, { label: string; guidance: string }> = {
  day: {
    label: "Day",
    guidance:
      "Warmth, openness, momentum, things going right. Not naive or safe - generosity and possibility are live, and hope is the register even when the situation is bad.",
  },
  neutral: {
    label: "Neutral",
    guidance:
      "No standing tonal bias. Play the scene as its own contents suggest.",
  },
  night: {
    label: "Night",
    guidance:
      "Weight, constraint, appetite, things costing something. Not grimdark - habit, desire, ambition and consequence are the register, and even good outcomes arrive with a price attached.",
  },
};

/**
 * Why Tint exists at all: `chaosFactor` and `tension` are both *intensity*
 * dials. Nothing in the director layer tracked tonal *register*, so the GM
 * drifted monotone and only varied tone when tension moved. The book names
 * the gap precisely - "in a GM-led game, the GM naturally senses when
 * change is needed; in solo play, that intuition is harder to
 * externalize." An LLM GM has the same defect for the same reason.
 *
 * A Lens Shift fires on doubles (both d12s showing the same archetype).
 * Deliberately keyed to the *portent* dice and not to `askFate`'s d100,
 * which already uses its own doubles rule for random events - two
 * independent triggers on one roll would make both harder to reason about.
 */
export interface LensShift {
  from: Tint;
  to: Tint;
  /** The doubled archetype, thematic input for what the shift is *about*. */
  symbol: Archetype;
  /** Which die won the proximity contest and therefore drove the shift. */
  primeDie: Polarity;
}

/**
 * The book resolves which d12 is "prime" by physical proximity to the
 * Syzygy die on the table. There is no table here, so the engine flips a
 * fair coin - proximity in a real toss is effectively random anyway, and
 * this keeps the shift outside the model's reach either way.
 */
export function applyLensShift(current: Tint, primeDie: Polarity): Tint {
  if (current === "neutral") {
    return primeDie === "sol" ? "day" : "night";
  }
  if (current === "day") {
    // Sol again settles back to centre; Nox carries all the way across.
    return primeDie === "sol" ? "neutral" : "night";
  }
  // current === "night"
  return primeDie === "nox" ? "neutral" : "day";
}

export function currentTint(storyData: StoryData): Tint {
  return storyData.agmtState?.tint ?? "neutral";
}

/**
 * Prompt line for the GM/story stages. Neutral returns "" - a standing
 * instruction that says "no standing instruction" is pure prompt budget
 * with no behavioural effect, and the budget is already tight.
 */
export function formatTintLine(storyData: StoryData): string {
  const tint = currentTint(storyData);
  if (tint === "neutral") return "";
  const info = TINT_INFO[tint];
  return `- Tint: **${info.label}** - ${info.guidance}`;
}

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------

function rollDie(faces: number): number {
  return Math.floor(Math.random() * faces) + 1;
}

function rollArchetype(): { archetype: Archetype; roll: number } {
  const roll = rollDie(12);
  return { archetype: ARCHETYPE_ORDER[roll - 1], roll };
}

function rollRelation(): { relation: Relation; roll: number } {
  const roll = rollDie(6);
  return { relation: RELATION_ORDER[roll - 1], roll };
}

/**
 * The three modes worth implementing.
 *
 * Pull/Pass - the book's fourth mode - is deliberately NOT here. "Roll
 * two, discard one on gut instinct, no justification required" is a
 * model-picks-its-own-outcome hole, the same anti-pattern already closed
 * for reasoning-tier self-escalation and director-move self-selection. A
 * model handed a veto reliably vetoes whatever inconveniences it. Peek,
 * Pinch and Portent are all safe because the engine fixes the result and
 * the model only interprets it.
 *
 * Pluck is a separate entry point (`pluck`, below) since it reads word
 * tables rather than producing symbols.
 */
export type PortentMode = "peek" | "pinch" | "portent";

export interface PortentTerm {
  archetype: Archetype;
  polarity: Polarity;
  keywords: string;
  roll: number;
}

export interface PortentResult {
  mode: PortentMode;
  /** Sol first, then Nox. A peek has exactly one. */
  terms: PortentTerm[];
  /** Portent mode only - the relation binding the two terms. */
  relation?: Relation;
  relationGroup?: RelationGroup;
  relationRoll?: number;
  /**
   * Portent mode only. The book reads the die nearer the Syzygy first;
   * `terms` stays in Sol/Nox order, and this says which one leads.
   */
  primeDie?: Polarity;
  /** The engine-chosen frame this result should be read through. */
  frame: Frame;
  /** Set when Sol and Nox matched and the tonal register moved. */
  lensShift?: LensShift;
  /** Human/model-readable form, e.g. "Knowledge (Sol) against Spirit (Nox)". */
  statement: string;
}

/**
 * Roll the dice. `currentTintValue` is threaded in rather than read off
 * StoryData so this stays a pure function - the caller persists the shift.
 */
export function rollPortent(
  mode: PortentMode,
  frame: Frame,
  currentTintValue: Tint = "neutral"
): PortentResult {
  if (mode === "peek") {
    // One die, one symbol, no synthesis. The engine picks which die so the
    // polarity isn't the model's to choose.
    const polarity: Polarity = Math.random() < 0.5 ? "sol" : "nox";
    const { archetype, roll } = rollArchetype();
    const term: PortentTerm = {
      archetype,
      polarity,
      keywords: keywordsFor(archetype, polarity),
      roll,
    };
    return {
      mode,
      terms: [term],
      frame,
      statement: `${archetype} (${polarity === "sol" ? "Sol" : "Nox"})`,
    };
  }

  const sol = rollArchetype();
  const nox = rollArchetype();

  const solTerm: PortentTerm = {
    archetype: sol.archetype,
    polarity: "sol",
    keywords: keywordsFor(sol.archetype, "sol"),
    roll: sol.roll,
  };
  const noxTerm: PortentTerm = {
    archetype: nox.archetype,
    polarity: "nox",
    keywords: keywordsFor(nox.archetype, "nox"),
    roll: nox.roll,
  };

  // Doubles on Sol/Nox trigger a Lens Shift in every two-d12 mode.
  let lensShift: LensShift | undefined;
  const primeDie: Polarity = Math.random() < 0.5 ? "sol" : "nox";
  if (sol.archetype === nox.archetype) {
    const to = applyLensShift(currentTintValue, primeDie);
    // A shift that lands where it started is not a shift - don't report
    // one and don't ask the model to narrate a change that didn't happen.
    if (to !== currentTintValue) {
      lensShift = {
        from: currentTintValue,
        to,
        symbol: sol.archetype,
        primeDie,
      };
    }
  }

  if (mode === "pinch") {
    return {
      mode,
      terms: [solTerm, noxTerm],
      frame,
      lensShift,
      statement: `${sol.archetype} (Sol) + ${nox.archetype} (Nox)`,
    };
  }

  const { relation, roll: relationRoll } = rollRelation();
  // The prime die is read first, then the other, joined by the relation.
  const [first, second] =
    primeDie === "sol"
      ? [solTerm, noxTerm]
      : [noxTerm, solTerm];

  return {
    mode,
    terms: [solTerm, noxTerm],
    relation,
    relationGroup: RELATION_GROUP[relation],
    relationRoll,
    primeDie,
    frame,
    lensShift,
    statement: `${first.archetype} (${
      first.polarity === "sol" ? "Sol" : "Nox"
    }) ${relation} ${second.archetype} (${
      second.polarity === "sol" ? "Sol" : "Nox"
    })`,
  };
}

/**
 * Render a rolled result as the block handed back to the model. Spells out
 * the keyword sets and the frame guidance inline, because a bare
 * "Knowledge against Spirit" invites the model to fall back on the most
 * obvious reading of two common English nouns - which is precisely the
 * default-reversion this oracle exists to interrupt.
 */
export function formatPortentForModel(result: PortentResult): string {
  const lines: string[] = [];
  const frameInfo = FRAME_INFO[result.frame];

  lines.push(`[Prima Materia · ${result.mode} · ${result.statement}]`);

  for (const term of result.terms) {
    const face = term.polarity === "sol" ? "Sol" : "Nox";
    lines.push(`[${face} — ${term.archetype}: ${term.keywords}]`);
  }

  if (result.relation) {
    const correlation =
      result.relationGroup === "celestial"
        ? "positive correlation - the two align, work together, or agree"
        : "negative correlation - the two are at odds, in tension, or separate";
    lines.push(
      `[Relation — "${result.relation}" (${result.relationGroup}): ${correlation}]`
    );
  }

  lines.push(`[Frame — ${frameInfo.label} (${frameInfo.scope}): ${frameInfo.guidance}]`);

  if (result.lensShift) {
    const to = TINT_INFO[result.lensShift.to];
    lines.push(
      `[⟳ LENS SHIFT: doubles on ${result.lensShift.symbol}. Tint moves ${
        TINT_INFO[result.lensShift.from].label
      } → **${to.label}**. ${to.guidance} The doubled symbol (${
        result.lensShift.symbol
      }) is what the change is *about*. This is a shift in register, not an event - let it colour what follows rather than announcing it.]`
    );
  }

  lines.push(
    `[This is an input, not an instruction. It describes a condition, not an outcome - recognise what it points at and let it shape the scene. Do not name the dice, the symbols, or this system in the narration.]`
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Pluck - the dice as pure randomisers into word tables
// ---------------------------------------------------------------------------
//
// See the provenance banner at the top of this file. Everything from here
// down is transcribed table data, not mechanism.

/** 12x12 tables, indexed [sol][nox] using ARCHETYPE_ORDER on both axes. */
type Grid = readonly (readonly string[])[];

const DISPOSITIONS: Grid = [
  ["Opportunistic","Indulgent","Speculative","Risk-averse","Calculating","Hopeful","Restless","Foraging","Complacent","Transactional","Status-seeking","Self-interested"],
  ["Hardy","Physical","Practical","Guarded","Reactive","Vital","Unrestrained","Feral","Sedate","Tactile","Laboring","Instinctive"],
  ["Shrewd","Clinical","Analytical","Cautious","Reflective","Inquisitive","Unorthodox","Observant","Measured","Advisory","Educated","Introspective"],
  ["Conservative","Protected","Prepared","Sheltered","Anxious","Reassured","Restrained","Hoarding","Stabilizing","Defensive","Rule-bound","Reserved"],
  ["Scheming","Distracted","Rational","Wary","Obsessive","Contemplative","Contrarian","Adaptive","Detached","Interpretive","Ideological","Self-aware"],
  ["Faithful","Ascetic","Seeking","Trusting","Visionary","Devout","Liberated","Animistic","Centered","Compassionate","Ritualized","Purpose-driven"],
  ["Adventurous","Reckless","Experimental","Defiant","Erratic","Ecstatic","Unbound","Nomadic","Unsettled","Elusive","Nonconformist","Self-directed"],
  ["Seasonal","Animalistic","Instinct-led","Burrowed","Primitive","Reverent","Wandering","Wild","Still","Pack-oriented","Tribal","Survival-focused"],
  ["Patient","Relaxed","Unhurried","Grounded","Untroubled","Serene","Unpressured","Dormant","Tranquil","Receptive","Agreeable","Content"],
  ["Networking","Affectionate","Communicative","Supportive","Empathic","Bonded","Open","Symbiotic","Reassuring","Relational","Communal","Interdependent"],
  ["Ambitious","Disciplined","Institutional","Regulated","Conventional","Ceremonial","Constrained","Domesticated","Predictable","Cooperative","Conforming","Role-defined"],
  ["Driven","Sensory","Self-taught","Guarding","Self-critical","Convicted","Independent","Self-preserving","Centered","Selective","Individualist","Self-focused"],
];

const ACTIONS: Grid = [
  ["Acquire","Indulge","Speculate","Hedge","Calculate","Hope","Gamble","Forage","Wait","Trade","Compete","Claim"],
  ["Endure","Strike","Practice","Guard","React","Breathe","Run","Hunt","Rest","Touch","Labor","Sense"],
  ["Appraise","Examine","Analyze","Verify","Reason","Question","Experiment","Observe","Reflect","Explain","Teach","Learn"],
  ["Preserve","Protect","Prepare","Secure","Worry","Trust","Restrict","Store","Stabilize","Defend","Regulate","Withdraw"],
  ["Scheme","Distract","Organize","Anticipate","Obsess","Imagine","Dissent","Adapt","Detach","Interpret","Ideologize","Assess"],
  ["Believe","Fast","Seek","Entrust","Envision","Devote","Liberate","Revere","Center","Comfort","Ritualize","Commit"],
  ["Risk","Leap","Test","Defy","Disrupt","Exalt","Escape","Roam","Unsettle","Evade","Reject","Choose"],
  ["Cycle","Feed","Instinct","Burrow","Simplify","Honor","Wander","Grow","Hibernate","Bond","Tribalize","Survive"],
  ["Wait","Relax","Ponder","Ground","Soothe","Accept","Release","Dormant","Settle","Receive","Acquiesce","Be"],
  ["Network","Embrace","Communicate","Support","Empathize","Bind","Open","Symbiose","Reassure","Relate","Cooperate","Share"],
  ["Advance","Discipline","Institutionalize","Enforce","Conform","Ceremonialize","Limit","Domesticate","Normalize","Coordinate","Organize","Roleplay"],
  ["Pursue","Indulge","Study","Guard","Critique","Convict","Assert","Endure","Center","Select","Differentiate","Define"],
];

const LANDMARKS: Grid = [
  ["Crossroads","Causeway","Landmark","Haven","Boundary","Pilgrimage","Open road","Floodplain","Meadow","Trade route","Market town","Homestead"],
  ["Quarry","Cliff","Trail","Shelter","Maze","Standing stones","Pass","Ravine","Clearing","Ford","Outpost","Camp"],
  ["Ruins","Excavation","Library","Watchtower","Labyrinth","Shrine","Old road","Fossil bed","Observatory","Message post","Academy","Study"],
  ["Stronghold","Wall","Surveyed land","Fort","Checkpoint","Sanctuary","Barricade","High ground","Refuge","Gate","Citadel","Safehouse"],
  ["Borderland","Switchbacks","Map edge","Perimeter","Dead end","Vision site","Detour","Badlands","Plateau","Signal hill","District","Hideout"],
  ["Sacred path","Processional way","Inscribed stones","Blessed ground","Meditation site","Temple","Open sky","Ancient grove","Still water","Gathering circle","Holy city","Hermitage"],
  ["Frontier","Scramble","Unmapped land","Escape route","Wilderness edge","Sky altar","Open plains","Steppe","Wide horizon","Driftway","Free city","Wanderer's camp"],
  ["Delta","Mountain","River source","Cave","Foglands","World tree","Migration path","Forest","Lake","Animal trail","Farmland","Burrow"],
  ["Pasture","Low hill","Survey point","Quiet harbor","Stillness","Zen garden","Open shore","Marsh","Pond","Rest stop","Village green","Retreat"],
  ["Caravan stop","Bridge","Waystation","Checkpoint","Crossing","Pilgrim road","Open gate","River bend","Meeting ground","Hub","Town","Doorway"],
  ["Capital","Barracks","Archive","Garrison","Performance","Cathedral","Restricted zone","Canals","Plaza","Road network","City","Residence"],
  ["Claim","Dwelling","Personal map","Hideaway","Inner boundary","Sanctum","Private path","Garden","Quiet room","Threshold","Neighborhood","Home"],
];

const NAMES: Grid = [
  ["Cookie","Harper","Magnolia","Harrison","Luna","Griscilla","Carrie","Carver","Bostwick","Dunston","Melba","Helden"],
  ["Quigley","Pierce","Vince","Roma","Bernadette","Pella","Ervin","Magna","Perrin","Alva","Prince","Maynard"],
  ["Crockett","Dewey","Rana","Arven","Mini","Sera","Frank","Connie","Sherbert","Vargas","Norman","Doris"],
  ["Eleanor","Cartwright","Amblin","Guy","Xia","Benz","Sir","Panda","Monroe","Bradley","Wayne","Dustty"],
  ["Bug","Lala","Vanna","Portia","Kenneth","Zead","Blink","Salvatore","Suliman","Bean","Tank","Mundi"],
  ["Jesh","Leppy","Dumars","Priya","Blessing","Jorma","Oliver","Anna","Sedgwick","Gary Wayne","Holly","Herman"],
  ["Frolly","Scott","Umberto","Estevez","Winnifred","Sky","Tana","Solly","Wendall","Darby","Fern","Wanda"],
  ["Delia","Montana","River","Nick","Foggy","Wodin","Mega","Finn","Lana","Andi","Farrah","Burroughs"],
  ["Vespin","Louis","Suriya","Quentin","Solamente","Zenni","Owen","Marsha","Pom","Reisling","Keith","Ruth"],
  ["Corlin","Bert","Candy","Cheech","Innis","Pinter","Huron","Tad","Meena","Bub","Torrin","Dennis"],
  ["Kelsey","Barry","Archie","Gogo","Millicent","Cat","Reynolds","Lulu","Plank","Reed","Clint","Remus"],
  ["Bambi","Dwight","Percy","Hilt","Inez","Stone","Presley","Gart","Flip","Teresa","Kimberly","Bunny"],
];

/**
 * The 6x6 tables. The book prints axis labels (Drive/Vitality/Reason/
 * Order/Will/Harmony down, Risk/Vulnerability/Belief/Doubt/Wildness/
 * Obligation across) but never states which die indexes which axis, and
 * the labels don't map onto the twelve archetypes in any way the text
 * makes explicit. Rather than invent a mapping and quietly get it wrong,
 * these are rolled as two independent d6s - mechanically sound, uses dice
 * that are actually in the set, and stays honest about the ambiguity.
 */
const COMPLICATION_ROWS = ["Drive","Vitality","Reason","Order","Will","Harmony"] as const;
const COMPLICATION_COLS = ["Risk","Vulnerability","Belief","Doubt","Wildness","Obligation"] as const;

const COMPLICATIONS: Grid = [
  ["A bold option avails itself, but could be dangerous","Your hastiness creates a problem","Personal values are put to the test","A piece of the puzzle is revealed","Someone acts out of character, causing surprise","Following duty or loyalty in this moment would mean leaving the path"],
  ["Overexertion leads to exhaustion or harm","Survival depends on confronting fear or discomfort","Something suddenly changes; the hair on your neck stands","Weariness clouds judgment","Nature (or the immediate environment) asserts itself","Labor of some kind is demanded by a power that is hard to refuse"],
  ["Something about \"the plan\" just showed a crack","New knowledge reveals an unfortunate truth","Something supernatural appears to happen… can it be explained?","Something is found (or said) that conflicts with expectations","Things are starting to feel a little chaotic","You feel the tug of responsibility even if you wish it were not so"],
  ["You are confronted by a challenge","Structures fail under pressure","Authority is justified by tradition or doctrine","Rules/tradition proves inadequate to the situation","You encounter something out of place","Compliance is enforced whether you like it or not"],
  ["A personal choice suddenly has consequences","Resolve falters under emotional strain","Your willpower, stamina, or endurance is tested","An event occurs that makes you question your allegiances","A temptation is revealed that conflicts with values/purpose","A choice emerges that pits your wants and needs against another"],
  ["Hint or rumor of a danger is conveyed","One of two things is required to advance: balance or trust","Surprising agreement or consensus is found","Tension rises, the source is not obvious","Something in the environment suddenly changes","For safety or stability a price must be paid"],
];

const QUEST_PROMPTS: Grid = [
  ["Deliver hazardous materials","Rescue missing child","Protect holy artifact","Determine traitorous ally","Navigate difficult terrain","Fulfill ancient promise"],
  ["Disarm dangerous traps","Delve into crumbling tunnel","Retrieve exotic medicine","Complete dying request","Save endangered land","Locate wayward sibling"],
  ["Find unique key","Recover saintly remains","Travel famous path","Eliminate deceitful member","Follow questionable map","Spy on suspicious worker"],
  ["Help growing rebellion","Aid burgeoning resistance","Punish evil sinners","Send deadly message","Destroy protected landmark","Interrogate only witness"],
  ["Reconquer lawful property","Guard rightful heir","Tame wild beast","Capture wanted thief","Secure resounding victory","Track down lost relative"],
  ["Save innocent group","Reconstitute partial writing","Maintain convenient delusion","Trust former opponents","Devour healthy meals","Accept chaotic ingredients"],
];

/**
 * The Quick Reference "Plucks" sheet: one-row oracles indexed by a single
 * Syzygy roll, in RELATION_ORDER.
 */
const QUICK_PLUCKS: Record<string, readonly string[]> = {
  decision: ["Yes", "No", "Yes but", "No but", "Yes and", "No and"],
  weather: ["Clear", "Bright", "Rain", "Wind", "Snow", "Fog"],
  scale: ["Tiny", "Small", "Average", "Large", "Huge", "Massive"],
  time: ["Dawn", "Morning", "Noon", "Afternoon", "Evening", "Night"],
  distance: ["Immediate", "Near", "Reachable", "Far", "Distant", "Unreachable"],
  power: ["Emerging", "Internal", "Opposed", "External", "Unstable", "Combining"],
  genus: ["Object", "Animal", "Plant", "Person", "Inhuman", "Spectral"],
  state: ["Solid", "Liquid", "Gas", "Energy", "Data/void", "Arcane/ethereal"],
  agency: ["Controlled", "Contested", "Influenced", "Aligned", "Autonomous", "Dominant"],
  intensity: ["Off/faint", "Low", "Moderate", "Strong", "Extreme", "Omnipotent"],
  // The book prints "Study" in this row, which is plainly an OCR/typo for
  // "Steady" given its neighbours (Static, Slow, Uneven, _, Rapid, Sudden).
  rate: ["Static", "Slow", "Uneven", "Steady", "Rapid", "Sudden"],
};

export type PluckTable =
  | "pm_dispositions"
  | "pm_actions"
  | "pm_landmarks"
  | "pm_names"
  | "pm_complications"
  | "pm_quest_prompts"
  | `pm_${string}`;

const GRID_12_TABLES: Record<string, Grid> = {
  pm_dispositions: DISPOSITIONS,
  pm_actions: ACTIONS,
  pm_landmarks: LANDMARKS,
  pm_names: NAMES,
};

const GRID_6_TABLES: Record<string, Grid> = {
  pm_complications: COMPLICATIONS,
  pm_quest_prompts: QUEST_PROMPTS,
};

/** Every Prima Materia table name `roll_table` will accept. */
export const PRIMA_MATERIA_TABLE_NAMES: string[] = [
  ...Object.keys(GRID_12_TABLES),
  ...Object.keys(GRID_6_TABLES),
  ...Object.keys(QUICK_PLUCKS).map((k) => `pm_${k}`),
];

export function isPrimaMateriaTable(name: string): boolean {
  return PRIMA_MATERIA_TABLE_NAMES.includes(name);
}

export interface PluckResult {
  table: string;
  result: string;
  /** Axis labels for the grid tables, so the roll is legible in the log. */
  detail: string;
}

/**
 * Roll on a Prima Materia table. `count` only applies to pm_quest_prompts,
 * whose sheet is labelled "(roll x3)" - three fragments meant to be
 * combined into one quest.
 */
export function pluck(table: string, count = 1): PluckResult | null {
  const grid12 = GRID_12_TABLES[table];
  if (grid12) {
    const sol = rollArchetype();
    const nox = rollArchetype();
    return {
      table,
      result: grid12[sol.roll - 1][nox.roll - 1],
      detail: `Sol ${sol.archetype} × Nox ${nox.archetype}`,
    };
  }

  const grid6 = GRID_6_TABLES[table];
  if (grid6) {
    const draws: string[] = [];
    const details: string[] = [];
    const n = table === "pm_quest_prompts" ? Math.max(1, Math.min(3, count)) : 1;
    for (let i = 0; i < n; i++) {
      const row = rollDie(6);
      const col = rollDie(6);
      draws.push(grid6[row - 1][col - 1]);
      details.push(
        table === "pm_complications"
          ? `${COMPLICATION_ROWS[row - 1]}/${COMPLICATION_COLS[col - 1]}`
          : `${row}×${col}`
      );
    }
    return {
      table,
      result: draws.join(" / "),
      detail: details.join(", "),
    };
  }

  const quick = QUICK_PLUCKS[table.replace(/^pm_/, "")];
  if (quick) {
    const roll = rollDie(6);
    return {
      table,
      result: quick[roll - 1],
      detail: `Syzygy: ${RELATION_ORDER[roll - 1]}`,
    };
  }

  return null;
}

/**
 * A complication rolled for the director layer. `selectDirectorMove`
 * already decides *which* move fires; until now the actual content of an
 * `announce_future_badness` / `put_someone_in_a_spot` was left entirely to
 * the model, which is where its habitual complications came from. This
 * gives the move a rolled seed to work from.
 */
export function rollComplication(): PluckResult {
  return pluck("pm_complications")!;
}
