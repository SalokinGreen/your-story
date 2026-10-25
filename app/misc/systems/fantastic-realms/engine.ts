/**
 * Fantastic Realms: the pure arithmetic (docs/fantastic-realms-design.md
 * section 2, plan slice 2). No I/O and no dice: the executors throw the dice
 * and hand the faces in.
 */
import type {
  FantasticRealmsState,
  HeroCondition,
  HeroFeat,
  ItemQuality,
  MeterSet,
} from "../../structs";

export type FeatTier = "miss" | "weak_hit" | "hit" | "strong_hit";

export interface FeatResult {
  tier: FeatTier;
  /** One magnitude per success beyond 3 (only a strong hit has any). */
  magnitude: number;
}

export const MAX_LEVEL = 20;
export const STARTING_HEARTS = 3;
/** A hero's name for the meters: the "Fantastic Realms hero" set. */
export const HERO_SET_NAME = "Fantastic Realms hero";

/**
 * The hero meter set as the plan defines it, used when the resolved system
 * does not carry one by that name. Hearts' max rises with levels, and the
 * XP meter's max is moved to the next level's cost as the hero levels.
 */
export const FALLBACK_HERO_SET: MeterSet = {
  name: HERO_SET_NAME,
  meters: [
    { name: "Hearts", min: 0, max: 3, start: 3 },
    { name: "Level", min: 1, max: 20, start: 1 },
    { name: "XP", min: 0, max: 2000, start: 0 },
  ],
};

/** Each die that equals or beats the DC is a success (decision 202). */
export function countSuccesses(dice: number[], dc: number): number {
  return dice.filter((d) => d >= dc).length;
}

export function resultFor(successes: number): FeatResult {
  const n = Math.max(0, Math.floor(successes));
  if (n === 0) return { tier: "miss", magnitude: 0 };
  if (n === 1) return { tier: "weak_hit", magnitude: 0 };
  if (n === 2) return { tier: "hit", magnitude: 0 };
  return { tier: "strong_hit", magnitude: Math.max(0, n - 3) };
}

/** Hearts a foe loses (design 2.6): weak 1, hit 1, strong 2 plus the magnitude. */
export function foeDamage(r: FeatResult): number {
  switch (r.tier) {
    case "miss":
      return 0;
    case "weak_hit":
    case "hit":
      return 1;
    case "strong_hit":
      return 2 + r.magnitude;
  }
}

/** XP to go from `level` to `level + 1`. */
export function levelCost(level: number): number {
  return (level + 1) * 1000;
}

export interface XpOutcome {
  level: number;
  xp: number;
  /** Each level reached, in order. */
  levelsGained: number[];
  /** The gained levels divisible by 3: each gives +1 maximum heart. */
  heartLevels: number[];
}

/** Adds XP, carrying over level by level; level caps at 20 and XP is kept at that level's cost. */
export function applyXp(level: number, xp: number, amount: number): XpOutcome {
  let lvl = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  let pool = Math.max(0, xp) + Math.max(0, amount);
  const levelsGained: number[] = [];
  const heartLevels: number[] = [];
  while (lvl < MAX_LEVEL && pool >= levelCost(lvl)) {
    pool -= levelCost(lvl);
    lvl += 1;
    levelsGained.push(lvl);
    if (lvl % 3 === 0) heartLevels.push(lvl);
  }
  if (lvl >= MAX_LEVEL) pool = Math.min(pool, levelCost(MAX_LEVEL));
  return { level: lvl, xp: pool, levelsGained, heartLevels };
}

/** Feat wording matched loosely: case and punctuation do not count. */
export function normaliseFeat(wording: string): string {
  return String(wording ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function tierWord(tier: FeatTier): string {
  switch (tier) {
    case "miss":
      return "MISS";
    case "weak_hit":
      return "WEAK HIT";
    case "hit":
      return "HIT";
    case "strong_hit":
      return "STRONG HIT";
  }
}

// ============================================
// The grown rules (docs/fr-expansion-plan.md E1, design section 14)
// ============================================

/** Team burns a party may spend between party rests (decision 251). */
export const TEAM_BURNS_PER_REST = 2;
/** Conditions that are not scars which put a hero down (decision 250). */
export const CONDITIONS_TO_BE_DOWN = 3;

export const ITEM_QUALITIES: readonly ItemQuality[] = [
  "keen",
  "sturdy",
  "warded",
  "swift",
  "bright",
  "cursed",
  "hardy",
  "silent",
  "blessed",
  "returning",
  "masterwork",
  "heirloom",
];

/** Hungry carries this cure: only a meal clears it, a rest alone does not. */
export const HUNGRY_WORD = "hungry";
export const HUNGRY_CURE = "a meal";

/**
 * Down is derived, never stored: hearts at 0, or the third condition that is
 * not a scar. Raising hearts or clearing a condition lifts it, which is how a
 * healing spell works (decision 254). Unknown hearts (a hero with no Hearts
 * meter) never count as 0.
 */
export function isDown(
  hearts: number | undefined,
  conditions: readonly HeroCondition[] | undefined,
): boolean {
  if (typeof hearts === "number" && hearts <= 0) return true;
  const counted = (conditions ?? []).filter((c) => !c.scar).length;
  return counted >= CONDITIONS_TO_BE_DOWN;
}

export type FeatUsable = { ok: true } | { ok: false; reason: string };

/**
 * The one check every use of a feat passes (design 14): a burned feat, a
 * broken item and a lost item all refuse alike, so feat_roll, initiative_roll,
 * helping and team burns agree. `reason` finishes the sentence
 * `<hero>'s feat "<wording>" ...`.
 */
export function featUsable(feat: HeroFeat): FeatUsable {
  if (feat.status === "lost") return { ok: false, reason: "is lost until it is recovered" };
  if (feat.status === "broken") return { ok: false, reason: "is broken until it is mended" };
  if (feat.burned) return { ok: false, reason: "is burned and adds nothing until a rest" };
  return { ok: true };
}

export interface PoolInput {
  /** Feats of the roller that add a die. */
  feats: number;
  /** A helper adds one die. */
  helped?: boolean;
  /** Conditions in the way: one die each. */
  hindrances?: number;
  /** A team burn adds two sure successes and no dice (decision 255), so it never changes the pool. */
  teamBurn?: boolean;
}

/** Dice rolled: 1, plus one per feat and one for a helper, minus one per hindrance, never below 1. */
export function poolSize(input: PoolInput): number {
  const dice =
    1 +
    Math.max(0, Math.floor(input.feats)) +
    (input.helped ? 1 : 0) -
    Math.max(0, Math.floor(input.hindrances ?? 0));
  return Math.max(1, dice);
}

/** foeDamage, plus 1 on a strong hit with a Keen item (the engine's number, not the GM's). */
export function attackDamage(
  result: FeatResult,
  qualities: readonly ItemQuality[] | undefined,
): number {
  const base = foeDamage(result);
  return result.tier === "strong_hit" && (qualities ?? []).includes("keen") ? base + 1 : base;
}

/** A journey's tally (design 14): miss -1, weak hit 0, hit and strong hit +1. */
export function tallyScore(tier: FeatTier): number {
  switch (tier) {
    case "miss":
      return -1;
    case "weak_hit":
      return 0;
    case "hit":
    case "strong_hit":
      return 1;
  }
}

/** A feat as the GM and the player read it: its qualities and state in one bracket. */
export function describeFeat(f: HeroFeat): string {
  const parts: string[] = [];
  for (const q of f.qualities ?? []) parts.push(q.charAt(0).toUpperCase() + q.slice(1));
  if (f.status) parts.push(f.status);
  if (f.burned) parts.push("burned");
  return parts.length > 0 ? `${f.wording} (${parts.join(", ")})` : f.wording;
}

/** The qualities an item feat carries (a skill or spell carries none). */
export function itemQualities(f: HeroFeat): ItemQuality[] {
  return f.kind === "item" ? [...(f.qualities ?? [])] : [];
}

/** True when the item is usable and Swift: it counts as an edge for initiative. */
export function isSwiftItem(f: HeroFeat): boolean {
  return f.kind === "item" && (f.qualities ?? []).includes("swift") && featUsable(f).ok;
}

/** `Wounded, Poisoned (needs an antidote)`: the non-scar conditions, in order. */
export function describeConditions(conditions: readonly HeroCondition[] | undefined): string {
  return (conditions ?? [])
    .filter((c) => !c.scar)
    .map((c) => (c.cure ? `${c.word} (needs ${c.cure})` : c.word))
    .join(", ");
}

export function describeScars(conditions: readonly HeroCondition[] | undefined): string {
  return (conditions ?? [])
    .filter((c) => c.scar)
    .map((c) => c.word)
    .join(", ");
}

export type UsePer = "scene" | "rest" | "adventure";

/** The counter key for a feat or a named move. */
export function usageKey(id: string, per: UsePer): string {
  return `${id}:${per}`;
}

/**
 * Drops every counter that ends with `:<per>` (a scene, a rest or an adventure
 * ended). Returns a new record, or undefined when nothing is left.
 */
export function resetUses(
  uses: Record<string, number> | undefined,
  per: UsePer,
): Record<string, number> | undefined {
  if (!uses) return uses;
  const suffix = `:${per}`;
  const kept: Record<string, number> = {};
  for (const [k, v] of Object.entries(uses)) if (!k.endsWith(suffix)) kept[k] = v;
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * A scene or an adventure ended: reset the matching counters on every hero.
 * Mutates the state it is given (the executors work on a clone). A no-op when
 * the story holds no Fantastic Realms state, so other systems are untouched.
 */
export function resetCountersOnState(
  state: FantasticRealmsState | undefined,
  per: "scene" | "adventure",
): void {
  if (!state) return;
  for (const hero of Object.values(state.heroes ?? {})) {
    if (!hero.uses) continue;
    const next = resetUses(hero.uses, per);
    if (next) hero.uses = next;
    else delete hero.uses;
  }
  if (state.partyUses) {
    // An adventure ends every hearth counter; a scene only the per-scene ones.
    const next = per === "adventure" ? undefined : resetUses(state.partyUses, per);
    if (next) state.partyUses = next;
    else delete state.partyUses;
  }
}
