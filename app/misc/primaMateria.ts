/**
 * Prima Materia - an alchemical oracle (Man Alone / Dice Nest, Dec 2025).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PROVENANCE
 *
 * This file implements the book's *mechanics* - three dice, twelve
 * archetypes, six relations, Frames, Tint, the Lens Shift - which are
 * systems, not expression. It contains none of the book's text: the
 * appendix word tables (dispositions, actions, landmarks, names,
 * complications, quest prompts, quick plucks) and the Quick Reference
 * keyword sets were transcribed verbatim in PR #188 and removed on
 * 2026-10-21. The keyword sets and complication seeds below are original
 * placeholders written for this project. A player who owns the book can
 * import its tables as `type: "table"` notes. See docs/prima-materia.md.
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
 * Face order of the two d12s. The portent mechanism works with any order;
 * this one was chosen to match how the book's appendix tables are indexed,
 * and it's kept as-is so seeded tests and existing saves stay reproducible.
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

/**
 * What each archetype points at when read bright (Sol) or shadowed (Nox).
 * Original placeholder sets written for this project - not the book's
 * Quick Reference keywords. They exist so the model has something more
 * specific than a bare noun like "Fortune" to interpret.
 */
export const SOL_KEYWORDS: Record<Archetype, string> = {
  Fortune: "a windfall, good timing, a lucky break, an opening, a gift",
  Body: "vigour, a steady hand, speed, stamina, comfort, physical presence",
  Knowledge: "a clue, a revelation, expertise, a record, a lesson, recognition",
  Safety: "a haven, defences, supplies, a safe route, a fallback",
  Mind: "a clear head, a plan, cunning, concentration, a good idea, composure",
  Spirit: "courage, devotion, a calling, renewed hope, inner strength, grace",
  Freedom: "an open road, options, a way out, self-rule, daring, room to move",
  Nature: "fair weather, fertile land, the seasons, wildlife, abundance",
  Calm: "respite, a pause, healing, quiet, equilibrium, contentment",
  Connection: "friendship, an ally, a message, loyalty, kinship, an introduction",
  Society: "a community, custom, law, standing, a guild or faction, hospitality",
  Self: "a personal goal, honesty, pride, a talent, a choice of one's own",
};

export const NOX_KEYWORDS: Record<Archetype, string> = {
  Fortune: "a bad bet, an unpaid cost, bad timing, a curse, a stroke of ill luck",
  Body: "a wound, exhaustion, sickness, a physical limit, clumsiness",
  Knowledge: "a false lead, a blind spot, a forgotten fact, a rumour, a lie",
  Safety: "an ambush, a weak point, peril, a breach, nowhere to hide, alarm",
  Mind: "second-guessing, a fixation, paranoia, a wandering mind, prejudice",
  Spirit: "hopelessness, remorse, a crisis of faith, hollowness, cynicism",
  Freedom: "a cage, a pursuer, banishment, chaos, a price for leaving, no way back",
  Nature: "a storm, rot, the untamed wild, hard terrain, the inevitable",
  Calm: "a rut, things left unsaid, apathy, a stall, putting it off, an eerie hush",
  Connection: "a tangled loyalty, a favour owed, reliance, betrayal, blackmail, a feud",
  Society: "red tape, a pecking order, watching eyes, faction politics, being shut out",
  Self: "vanity, loneliness, self-deception, a hidden flaw, being at war with oneself",
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
  // With a campaign record the clocks are the timers (the old list is stale).
  const activeTimers = storyData.campaign
    ? storyData.campaign.clocks.filter(
        (c) => !c.paused && !c.cancelled && c.filled < c.segments
      )
    : (storyData.timers || []).filter((t) => t.status === "active");

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
 * drifted monotone and only varied tone when tension moved. The book makes
 * the same point about solo play: a human GM feels when the tone needs to
 * change, and a solo player needs that sense externalised. An LLM GM has
 * the same defect for the same reason.
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
 * Pull/Pass - the book's fourth mode, where you roll two and freely
 * discard one - is deliberately NOT here. It's a
 * model-picks-its-own-outcome hole, the same anti-pattern already closed
 * for reasoning-tier self-escalation and director-move self-selection. A
 * model handed a veto reliably vetoes whatever inconveniences it. Peek,
 * Pinch and Portent are all safe because the engine fixes the result and
 * the model only interprets it.
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
// Complication seeds for the director layer
// ---------------------------------------------------------------------------

/**
 * Original placeholder list written for this project. It replaces the
 * book's 6x6 complications grid, which was removed along with the other
 * appendix tables (see the provenance banner at the top of this file).
 *
 * `selectDirectorMove` already decides *which* pressure move fires
 * (`announce_future_badness` / `put_someone_in_a_spot`). Without a seed,
 * the move's actual content is pure model improvisation, which is where
 * its habitual complications come from. Each entry is deliberately
 * setting-agnostic, so the model has to shape it to the fiction.
 */
const COMPLICATION_SEEDS: readonly string[] = [
  "Someone wants something, and now is the worst time to say no",
  "A resource that was being counted on runs out or proves unreliable",
  "An old decision comes back with a cost attached",
  "Help arrives, but it comes with strings",
  "The way forward closes, and another opens somewhere less welcome",
  "Two things worth keeping can't both be kept",
  "Gear, a plan or a person that was relied on breaks at the worst moment",
  "A rival makes their move while attention is elsewhere",
  "Whatever was coming arrives sooner than expected",
  "An ally's private agenda surfaces",
  "What was told turns out to be only half the story",
  "A small mistake is noticed by exactly the wrong person",
  "The place itself turns hostile: ground, weather or structure",
  "Someone innocent ends up standing in the way",
  "Succeeding here will draw attention nobody wants",
  "Someone calls in a favour that is owed",
  "The thing being sought has changed hands",
  "A wound or weakness from earlier picks this moment to matter",
  "Someone with official standing takes an interest",
  "Two threats that were separate start working together",
  "Something that was holding a danger back stops holding",
  "Someone who could have been helped earlier pays the price now",
  "A reputation arrives before the people it belongs to",
  "The quiet option disappears; whatever happens next will be loud",
];

/** One complication seed for a director pressure move. */
export function rollComplication(): string {
  return COMPLICATION_SEEDS[rollDie(COMPLICATION_SEEDS.length) - 1];
}
