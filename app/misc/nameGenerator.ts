/**
 * Name pointer generator - deterministic entropy for naming new entities.
 *
 * Models have a strong attractor toward the same handful of fantasy names
 * (Elara, Kael, Lyra, Thorne...). Handing the model a curated name list only
 * moves the problem - the list runs out, and it still picks the first entry
 * that "feels right". So this module inverts the usual split: instead of the
 * engine producing a finished name, it rolls the *constraints* a name has to
 * satisfy - a starting letter per part, a syllable count, and a few seed
 * sounds - and the GM writes a name that fits them. Entropy is deterministic
 * and outside the model's control; the creative assembly stays with the model,
 * so names still land in the adventure's language and genre.
 *
 * Rolled initials steer away from letters already in play (see
 * `collectUsedInitials`) so a campaign doesn't drift into three NPCs whose
 * names all start with K. A GM that *wants* a collision (naming the brother of
 * an existing NPC, a dwarf clan where everyone is a V) locks the letter via
 * `starts_with` instead, which bypasses avoidance.
 */

import { StoryData } from "./structs";

/** What kind of thing is being named - only affects labels and defaults. */
export type NameKind = "person" | "place" | "faction" | "creature" | "object";

export const NAME_KINDS: NameKind[] = [
  "person",
  "place",
  "faction",
  "creature",
  "object",
];

/** Hard cap on name parts (given / middle / family). */
export const MAX_NAME_PARTS = 3;

/** Rolled (or GM-locked) constraints for one part of a name. */
export interface NamePartPointer {
  /** "Given name", "Family name", "First word"... - depends on kind/count. */
  label: string;
  /** Uppercase letter the part must start with. */
  initial: string;
  /** How many syllables the part should have. */
  syllables: number;
  /** Seed syllables as inspiration only - the GM need not use them verbatim. */
  sounds: string[];
  /** True when the GM supplied the initial rather than the engine rolling it. */
  locked: boolean;
}

export interface NamePointers {
  kind: NameKind;
  /** Free-text style hint from the GM, echoed back untouched. */
  flavor?: string;
  parts: NamePartPointer[];
  /** Initials skipped because they're already in play. */
  avoidedInitials: string[];
}

type Rng = () => number;

// ============================================
// PHONETIC INVENTORY
// ============================================
// Onsets are grouped by their first letter so a rolled initial can constrain
// the first syllable without constraining anything else. Vowel-initial parts
// take their opening sound from the nucleus table instead.

const ONSETS_BY_LETTER: Record<string, string[]> = {
  b: ["b", "br", "bl"],
  c: ["c", "ch", "cr", "cl"],
  d: ["d", "dr", "dw"],
  f: ["f", "fr", "fl"],
  g: ["g", "gr", "gl", "gh"],
  h: ["h"],
  j: ["j"],
  k: ["k", "kr", "kh"],
  l: ["l"],
  m: ["m", "mr"],
  n: ["n"],
  p: ["p", "pr", "pl", "ph"],
  q: ["qu"],
  r: ["r", "rh"],
  s: ["s", "sh", "st", "sk", "sl", "sn", "sp", "sw", "str"],
  t: ["t", "tr", "th", "tw"],
  v: ["v", "vr"],
  w: ["w", "wr"],
  x: ["x"],
  y: ["y"],
  z: ["z", "zh"],
};

const VOWELS = ["a", "e", "i", "o", "u"];

/** Nuclei, keyed for vowel-initial lookups. Simple vowels repeat so they win. */
const NUCLEI = [
  "a",
  "a",
  "a",
  "e",
  "e",
  "e",
  "i",
  "i",
  "i",
  "o",
  "o",
  "o",
  "u",
  "u",
  "ae",
  "ai",
  "au",
  "ea",
  "ei",
  "eo",
  "ia",
  "ie",
  "io",
  "oa",
  "oi",
  "ou",
  "ua",
  "y",
];

const CODAS = [
  "n",
  "r",
  "l",
  "s",
  "m",
  "th",
  "k",
  "d",
  "t",
  "ss",
  "ll",
  "rn",
  "st",
  "nd",
  "sh",
  "ph",
  "v",
  "z",
  "ng",
  "rk",
  "lm",
];

/**
 * Relative odds of each letter being rolled as an initial. Loosely follows how
 * often letters actually open names, flattened so the tail stays reachable -
 * the point is to break the model's habits, not to reproduce a census. Q/U/X
 * are rare rather than absent.
 */
const INITIAL_WEIGHTS: Record<string, number> = {
  a: 6,
  b: 6,
  c: 6,
  d: 6,
  e: 4,
  f: 5,
  g: 5,
  h: 5,
  i: 3,
  j: 4,
  k: 5,
  l: 5,
  m: 6,
  n: 5,
  o: 3,
  p: 5,
  q: 1,
  r: 5,
  s: 6,
  t: 5,
  u: 1,
  v: 4,
  w: 4,
  x: 1,
  y: 2,
  z: 2,
};

const ALL_INITIALS = Object.keys(INITIAL_WEIGHTS);

/** Letters that can open a syllable with a consonant cluster. */
const ONSET_LETTERS = ALL_INITIALS.filter((l) => ONSETS_BY_LETTER[l]);

/**
 * Below this many free letters, avoidance is dropped entirely - a long
 * campaign shouldn't be squeezed into whatever three letters are left.
 */
const MIN_FREE_INITIALS = 6;

// ============================================
// PRIMITIVES
// ============================================

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

function pickWeighted(letters: string[], rng: Rng): string {
  const total = letters.reduce((sum, l) => sum + (INITIAL_WEIGHTS[l] ?? 1), 0);
  let roll = rng() * total;
  for (const letter of letters) {
    roll -= INITIAL_WEIGHTS[letter] ?? 1;
    if (roll < 0) return letter;
  }
  return letters[letters.length - 1];
}

/**
 * Build one syllable. When `requiredInitial` is set the syllable is forced to
 * start with that letter - vowels through the nucleus, consonants through the
 * onset. `final` suppresses codas mid-word so seeds stay pronounceable.
 */
function buildSyllable(
  rng: Rng,
  requiredInitial?: string,
  final = false
): string {
  let onset = "";
  let nucleus: string;

  if (requiredInitial && VOWELS.includes(requiredInitial)) {
    const matching = NUCLEI.filter((n) => n.startsWith(requiredInitial));
    nucleus = matching.length ? pick(matching, rng) : requiredInitial;
  } else {
    if (requiredInitial) {
      const options = ONSETS_BY_LETTER[requiredInitial];
      onset = options ? pick(options, rng) : requiredInitial;
    } else if (rng() < 0.85) {
      // Weighted here too, so rare letters stay rare mid-word instead of
      // salting every seed with x/q/z.
      onset = pick(ONSETS_BY_LETTER[pickWeighted(ONSET_LETTERS, rng)], rng);
    }
    nucleus = pick(NUCLEI, rng);
  }

  // Codas mostly land at the end of a word; mid-word they're occasional.
  const codaChance = final ? 0.55 : 0.2;
  const coda = rng() < codaChance ? pick(CODAS, rng) : "";

  return `${onset}${nucleus}${coda}`;
}

/** Seed syllables for a part with a fixed opening letter. */
function buildSounds(rng: Rng, initial: string, syllables: number): string[] {
  const sounds: string[] = [];
  for (let i = 0; i < syllables; i++) {
    sounds.push(
      buildSyllable(
        rng,
        i === 0 ? initial.toLowerCase() : undefined,
        i === syllables - 1
      )
    );
  }
  return sounds;
}

/**
 * Syllable count for a part. Later parts of a person's name (family names)
 * skew shorter than the given name; non-person names skew shorter overall.
 */
function rollSyllableCount(
  rng: Rng,
  kind: NameKind,
  partIndex: number,
  partCount: number
): number {
  const isTrailingPersonPart = kind === "person" && partIndex > 0;
  const short = kind !== "person" || isTrailingPersonPart;
  // Middle names of a three-part person name are usually the shortest.
  const veryShort = kind === "person" && partCount === 3 && partIndex === 1;

  const roll = rng();
  if (veryShort) return roll < 0.55 ? 1 : 2;
  if (short) {
    if (roll < 0.35) return 1;
    if (roll < 0.8) return 2;
    return 3;
  }
  if (roll < 0.15) return 1;
  if (roll < 0.6) return 2;
  if (roll < 0.92) return 3;
  return 4;
}

// ============================================
// USED-INITIAL COLLECTION
// ============================================

/** Note types that are scaffolding rather than named things in the world. */
const NON_ENTITY_LORE_TYPES = new Set([
  "mechanics",
  "character_sheet",
  "gm_plan",
  "dm_instructions",
  "story_instructions",
  "gm_notes",
]);

function addInitials(source: string | undefined, into: Set<string>): void {
  if (!source) return;
  for (const word of source.split(/[\s/,'"-]+/)) {
    const letter = word.trim().charAt(0).toLowerCase();
    if (letter >= "a" && letter <= "z") into.add(letter);
  }
}

/**
 * Letters that entities in this story already start with: the player, tracked
 * NPCs (and their aliases), live combatants, world-note titles, and the
 * character/location names notes point at. Deliberately skips mechanics and
 * plan notes, whose titles ("Mechanics", "Campaign Plan") name no one.
 *
 * Returned uppercase and sorted.
 */
export function collectUsedInitials(storyData: StoryData): string[] {
  const used = new Set<string>();

  addInitials(storyData.player_name, used);

  for (const npc of storyData.npcs || []) {
    addInitials(npc.name, used);
    for (const alias of npc.aliases || []) addInitials(alias, used);
  }

  for (const combatant of storyData.combatState?.combatants || []) {
    addInitials(combatant.name, used);
  }

  for (const note of storyData.lore || []) {
    if (!NON_ENTITY_LORE_TYPES.has(note.type || "lore")) {
      addInitials(note.title, used);
    }
    for (const character of note.relatedCharacters || []) {
      addInitials(character, used);
    }
    for (const location of note.relatedLocations || []) {
      addInitials(location, used);
    }
  }

  return Array.from(used)
    .map((l) => l.toUpperCase())
    .sort();
}

// ============================================
// POINTER GENERATION
// ============================================

export interface NamePointerRequest {
  kind?: NameKind;
  /** How many parts to roll (1-3). Defaults by kind. */
  parts?: number;
  /** Style hint echoed back to the GM verbatim. */
  flavor?: string;
  /**
   * Per-part locked initials, aligned with part order. Empty string, "?" or a
   * non-letter means "roll this one". Locked letters bypass avoidance.
   */
  starts_with?: string[];
  /** Per-part locked syllable counts, aligned with part order. */
  syllables?: number[];
}

function defaultPartCount(kind: NameKind): number {
  return kind === "person" ? 2 : 1;
}

function partLabels(kind: NameKind, count: number): string[] {
  if (kind === "person") {
    if (count === 1) return ["Name"];
    if (count === 2) return ["Given name", "Family name"];
    return ["Given name", "Middle name", "Family name"];
  }
  if (count === 1) return ["Name"];
  if (count === 2) return ["First word", "Second word"];
  return ["First word", "Second word", "Third word"];
}

/** Normalize a GM-supplied initial to a single lowercase letter, or undefined. */
function normalizeLockedInitial(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const letter = raw.trim().charAt(0).toLowerCase();
  return letter >= "a" && letter <= "z" ? letter : undefined;
}

function clampSyllables(raw: number | undefined): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.max(1, Math.min(4, Math.round(raw)));
}

/**
 * Roll the constraints for a name. Pure apart from `rng` - pass a seeded
 * generator in tests.
 */
export function generateNamePointers(
  request: NamePointerRequest,
  usedInitials: string[] = [],
  rng: Rng = Math.random
): NamePointers {
  const kind: NameKind = NAME_KINDS.includes(request.kind as NameKind)
    ? (request.kind as NameKind)
    : "person";

  const requestedParts = request.parts ?? defaultPartCount(kind);
  const partCount = Math.max(
    1,
    Math.min(MAX_NAME_PARTS, Math.round(requestedParts) || 1)
  );

  const labels = partLabels(kind, partCount);
  const taken = new Set(usedInitials.map((l) => l.toLowerCase()));

  // Letters still free. If avoidance would leave too little to work with,
  // drop it rather than forcing every late-campaign name onto the same
  // leftover letters.
  let pool = ALL_INITIALS.filter((l) => !taken.has(l));
  const avoidanceApplied = pool.length >= MIN_FREE_INITIALS;
  if (!avoidanceApplied) pool = [...ALL_INITIALS];

  // Rolled initials are also unique within this call, so a two-part name
  // doesn't come back as "B... B...".
  const usedThisCall = new Set<string>();
  const parts: NamePartPointer[] = [];

  for (let i = 0; i < partCount; i++) {
    const locked = normalizeLockedInitial(request.starts_with?.[i]);
    let initial: string;

    if (locked) {
      initial = locked;
    } else {
      const available = pool.filter((l) => !usedThisCall.has(l));
      initial = pickWeighted(available.length ? available : pool, rng);
    }
    usedThisCall.add(initial);

    const syllables =
      clampSyllables(request.syllables?.[i]) ??
      rollSyllableCount(rng, kind, i, partCount);

    parts.push({
      label: labels[i],
      initial: initial.toUpperCase(),
      syllables,
      sounds: buildSounds(rng, initial, syllables),
      locked: Boolean(locked),
    });
  }

  return {
    kind,
    flavor: request.flavor,
    parts,
    avoidedInitials: avoidanceApplied
      ? Array.from(taken)
          .map((l) => l.toUpperCase())
          .sort()
      : [],
  };
}

/**
 * Render pointers as the bracketed line the GM stage reads back. Phrased to
 * make the split explicit: letters and syllable counts are binding, seed
 * sounds are only inspiration.
 */
export function formatNamePointers(
  pointers: NamePointers,
  reason?: string
): string {
  const header = pointers.flavor
    ? `Name pointers (${pointers.kind}, flavor: "${pointers.flavor}")`
    : `Name pointers (${pointers.kind})`;

  const lines = [`[${header}:`];

  for (const part of pointers.parts) {
    const syllableWord = part.syllables === 1 ? "syllable" : "syllables";
    const lockNote = part.locked ? " (you locked this letter)" : "";
    lines.push(
      `- ${part.label}: starts with "${part.initial}"${lockNote}, ` +
        `${part.syllables} ${syllableWord}, sounds like ${part.sounds.join("-")}`
    );
  }

  if (pointers.avoidedInitials.length) {
    lines.push(
      `- Already in play, not rolled: ${pointers.avoidedInitials.join(", ")}`
    );
  }

  if (reason) lines.push(`- Naming: ${reason}`);

  lines.push(
    "Build the actual name yourself from these pointers. The starting letters " +
      "and syllable counts are binding; the seed sounds are only inspiration - " +
      "reshape them so the name fits this world's language and tone.]"
  );

  return lines.join("\n");
}
