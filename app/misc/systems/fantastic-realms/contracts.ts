/**
 * Fantastic Realms' event contracts (judge layer v2, design 11.2): what the
 * rules promise and a tool result can prove. One so far, `foe-damage`: a
 * feat_roll that names a foe and lands owes that foe's Hearts meter the damage
 * the rules give (design 2.6, `foeDamage`).
 *
 * Pure. It reads the turn's results and the story after the turn.
 */
import type {
  ContractTurn,
  EventContract,
  JudgeToolResult,
} from "../../judges/types";
import { normalizeKey } from "../../metersAndTracks";
import { foeDamage, type FeatTier } from "./engine";

interface FeatRollShape {
  type?: string;
  outcome?: FeatTier;
  magnitude?: number;
  target?: string;
  /** The damage the engine worked out, Keen included (E1). Absent on a result from before it. */
  damage?: number;
}

interface MeterResultShape {
  type?: string;
  action?: string;
  owner?: string;
  meter?: string;
  change?: { before: number; after: number; requested: number };
}

const HEARTS = "hearts";

function isErrorText(r: JudgeToolResult): boolean {
  const text = r.contextForStory ?? "";
  return text.startsWith("[ERROR") || text.startsWith("[State Failed");
}

function targetOf(result: unknown): string | null {
  const t = (result as FeatRollShape | undefined)?.target;
  return typeof t === "string" && t.trim() ? t.trim() : null;
}

function damageOf(result: unknown): number {
  const r = result as FeatRollShape;
  // The engine's own number, qualities included (Keen adds a heart on a strong hit).
  if (typeof r.damage === "number") return r.damage;
  if (!r.outcome) return 0;
  return foeDamage({ tier: r.outcome, magnitude: r.magnitude ?? 0 });
}

/** Hearts the foe lost this turn as the GM asked for them (the request, not the clamped result). */
function heartsRequestedLoss(
  results: readonly JudgeToolResult[],
  target: string,
): number {
  const key = normalizeKey(target);
  let lost = 0;
  for (const r of results) {
    if (r.toolName !== "manage_meter" || !r.success || isErrorText(r)) continue;
    const res = r.result as MeterResultShape | undefined;
    if (res?.type !== "manage_meter" || !res.change) continue;
    if (normalizeKey(res.owner ?? "") !== key) continue;
    if (normalizeKey(res.meter ?? "") !== HEARTS) continue;
    if (res.action === "adjust") lost += -res.change.requested;
    // A set writes the target value: the loss is what it moved from.
    else if (res.action === "set") lost += res.change.before - res.change.requested;
  }
  return lost;
}

/** Every damage the turn's feat_rolls on this target owe, together. */
function damageOwed(results: readonly JudgeToolResult[], target: string): number {
  const key = normalizeKey(target);
  let owed = 0;
  for (const r of results) {
    if (r.toolName !== "feat_roll" || isErrorText(r)) continue;
    const t = targetOf(r.result);
    if (t && normalizeKey(t) === key) owed += damageOf(r.result);
  }
  return owed;
}

function foeHasHearts(turn: ContractTurn, target: string): boolean {
  const key = normalizeKey(target);
  const tracked = (turn.storyAfter.meters ?? []).some(
    (m) => normalizeKey(m.owner) === key && normalizeKey(m.name) === HEARTS,
  );
  if (tracked) return true;
  // Created this turn (and so recorded in the results, not yet in the story view).
  return turn.results.some((r) => {
    const res = r.result as (MeterResultShape & { created?: string[] }) | undefined;
    return (
      r.toolName === "manage_meter" &&
      r.success &&
      res?.type === "manage_meter" &&
      normalizeKey(res.owner ?? "") === key &&
      ((res.created ?? []).some((n) => normalizeKey(n) === HEARTS) ||
        normalizeKey(res.meter ?? "") === HEARTS)
    );
  });
}

export const FOE_DAMAGE_CONTRACT: EventContract = {
  id: "foe-damage",
  when: {
    tool: "feat_roll",
    resultType: "feat_roll",
    require: (result) =>
      targetOf(result) !== null && damageOf(result) > 0,
  },
  expects: (turn) => {
    const target = targetOf(turn.trigger.result);
    if (!target) return { ok: true };
    // A foe with no Hearts meter has nowhere to record the loss: not provable.
    if (!foeHasHearts(turn, target)) return { ok: true };
    // A hero (or an ally written as one) is not a foe: their Hearts are theirs.
    const heroes = turn.storyAfter.systemState?.fantasticRealms?.heroes ?? {};
    if (normalizeKey(target) in heroes) return { ok: true };
    const owed = damageOwed(turn.results, target);
    const applied = heartsRequestedLoss(turn.results, target);
    if (applied === owed) return { ok: true };
    return {
      ok: false,
      // More lost than the rules gave: the fix would be to heal the foe, which
      // is not ours to ask for. Flag it.
      flagOnly: applied > owed,
      key: normalizeKey(target),
      evidence: `${target}: the rolls this turn owe ${owed} ${owed === 1 ? "heart" : "hearts"}, and the Hearts meter was asked to lose ${applied}`,
    };
  },
  reask: (turn) => {
    const target = targetOf(turn.trigger.result) ?? "the foe";
    const owed = damageOwed(turn.results, target);
    const applied = heartsRequestedLoss(turn.results, target);
    const remaining = owed - applied;
    const call = `manage_meter({"action":"adjust","owner":${JSON.stringify(target)},"meter":"Hearts","by":${-remaining},"reason":"damage from the feat roll"})`;
    const state =
      applied === 0
        ? `${target}'s Hearts were not changed`
        : `${target}'s Hearts were asked to lose ${applied}, not ${owed}`;
    return `The rules say your feat roll against ${target} did ${owed} ${owed === 1 ? "heart" : "hearts"} of damage, and ${state}. Record the difference now: ${call}. Do not roll again; the dice are already thrown. Call only that, then end your reply.`;
  },
};

export const FANTASTIC_REALMS_EVENT_CONTRACTS: EventContract[] = [FOE_DAMAGE_CONTRACT];
