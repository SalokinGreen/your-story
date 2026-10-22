/**
 * Meters, progress tracks and the action-roll arithmetic.
 *
 * Pure functions: no StoryData access, no I/O, and no Math.random (the
 * executors throw the dice and hand the faces in). Every function returns new
 * objects; the executors write them back into the cloned StoryData.
 *
 * docs/default-systems-design.md section 4, plan slice 1.
 */

import type {
  Meter,
  MeterDedupKey,
  MeterDefinition,
  MeterSet,
  MeterThreshold,
  ProgressTrack,
  TrackKind,
  TrackRank,
} from "./structs";

export const TICKS_PER_MARK: Record<TrackRank, number> = {
  troublesome: 12,
  dangerous: 8,
  formidable: 4,
  extreme: 2,
  epic: 1,
};
export const TRACK_MAX_TICKS = 40;
export const ACTION_ADDS_CAP = 2;
export const ACTION_SCORE_CAP = 10;

/** An invalid definition or call. Executors turn it into an [ERROR] result. */
export class MeterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeterError";
  }
}

export function normalizeKey(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function meterId(owner: string, name: string): string {
  return `${normalizeKey(owner)}::${normalizeKey(name)}`;
}

export function trackId(owner: string, name: string): string {
  return `track:${meterId(owner, name)}`;
}

export function findMeter(
  meters: Meter[] | undefined,
  owner: string,
  name: string,
): Meter | undefined {
  const id = meterId(owner, name);
  return (meters || []).find((m) => m.id === id);
}

export function findTrack(
  tracks: ProgressTrack[] | undefined,
  owner: string,
  name: string,
): ProgressTrack | undefined {
  const id = trackId(owner, name);
  return (tracks || []).find((t) => t.id === id);
}

function requireInt(n: unknown, what: string): number {
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
    throw new MeterError(`${what} must be a whole number (got ${String(n)}).`);
  }
  return n;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function createMeter(def: MeterDefinition, owner: string): Meter {
  const name = (def.name ?? "").trim();
  if (!name) throw new MeterError("A meter needs a name.");
  const ownerName = (owner ?? "").trim();
  if (!ownerName) throw new MeterError("A meter needs an owner.");
  const min = requireInt(def.min, `${name}: min`);
  const max = requireInt(def.max, `${name}: max`);
  if (min > max) throw new MeterError(`${name}: min ${min} is above max ${max}.`);
  const floor = requireInt(def.floor ?? min, `${name}: floor`);
  const cap = requireInt(def.cap ?? max, `${name}: cap`);
  if (floor < min || floor > max) {
    throw new MeterError(`${name}: floor ${floor} is outside ${min}-${max}.`);
  }
  if (cap < floor || cap > max) {
    throw new MeterError(
      `${name}: cap ${cap} must be between floor ${floor} and max ${max}.`,
    );
  }
  const value = requireInt(def.start, `${name}: start`);
  if (value < floor || value > cap) {
    throw new MeterError(
      `${name}: start ${value} is outside ${floor}-${cap}.`,
    );
  }
  const meter: Meter = {
    id: meterId(ownerName, name),
    owner: ownerName,
    name,
    min,
    max,
    cap,
    floor,
    value,
  };
  if (def.thresholds && def.thresholds.length > 0) {
    meter.thresholds = [...def.thresholds]
      .map((t) => ({ ...t }))
      .sort((a, b) => a.at - b.at);
  }
  if (def.resetsAtSessionEnd !== undefined) {
    const r = requireInt(def.resetsAtSessionEnd, `${name}: resetsAtSessionEnd`);
    if (r < floor || r > cap) {
      throw new MeterError(`${name}: reset value ${r} is outside ${floor}-${cap}.`);
    }
    meter.resetsAtSessionEnd = r;
  }
  if (def.onlyUp) meter.onlyUp = true;
  if (def.hidden) meter.hidden = true;
  if (def.description) meter.description = def.description;
  return meter;
}

export function createMeterSet(
  set: MeterSet,
  owner: string,
  existing: Meter[],
): { created: Meter[]; skipped: string[] } {
  const created: Meter[] = [];
  const skipped: string[] = [];
  const have = new Set(existing.map((m) => m.id));
  for (const def of set.meters) {
    const id = meterId(owner, def.name);
    if (have.has(id)) {
      skipped.push(def.name);
      continue;
    }
    created.push(createMeter(def, owner));
    have.add(id);
  }
  return { created, skipped };
}

export interface MeterChange {
  before: number;
  after: number;
  requested: number; // the signed change asked for (adjust) or the target (set)
  clampedBy: number; // how much of the request the clamp removed (0 if none)
  crossedUp: MeterThreshold[];
  crossedDown: MeterThreshold[];
  atCap: boolean;
  atFloor: boolean;
}

function buildChange(
  meter: Meter,
  before: number,
  after: number,
  requested: number,
  clampedBy: number,
): MeterChange {
  const th = meter.thresholds || [];
  return {
    before,
    after,
    requested,
    clampedBy,
    crossedUp: th.filter((t) => before < t.at && t.at <= after),
    crossedDown: th.filter((t) => after < t.at && t.at <= before),
    atCap: after === meter.cap,
    atFloor: after === meter.floor,
  };
}

export function adjustMeter(
  meter: Meter,
  by: number,
): { meter: Meter; change: MeterChange } {
  const delta = requireInt(by, `${meter.name}: change`);
  if (meter.onlyUp && delta < 0) {
    throw new MeterError(
      `${meter.name} only rises; it cannot fall (asked for ${delta}).`,
    );
  }
  const before = meter.value;
  const after = clamp(before + delta, meter.floor, meter.cap);
  const next = { ...meter, value: after };
  const clampedBy = Math.abs(delta) - Math.abs(after - before);
  return { meter: next, change: buildChange(next, before, after, delta, clampedBy) };
}

export function setMeterValue(
  meter: Meter,
  value: number,
): { meter: Meter; change: MeterChange } {
  const target = requireInt(value, `${meter.name}: value`);
  if (meter.onlyUp && target < meter.value) {
    throw new MeterError(
      `${meter.name} only rises; it cannot be set below ${meter.value}.`,
    );
  }
  const before = meter.value;
  const after = clamp(target, meter.floor, meter.cap);
  const next = { ...meter, value: after };
  return {
    meter: next,
    change: buildChange(next, before, after, target, Math.abs(target - after)),
  };
}

export function setMeterCap(
  meter: Meter,
  cap: number,
): { meter: Meter; change: MeterChange } {
  const target = requireInt(cap, `${meter.name}: cap`);
  if (target < meter.floor || target > meter.max) {
    throw new MeterError(
      `${meter.name}: cap ${target} must be between floor ${meter.floor} and max ${meter.max}.`,
    );
  }
  if (meter.onlyUp && target < meter.value) {
    throw new MeterError(
      `${meter.name} only rises; a cap of ${target} would pull it down from ${meter.value}.`,
    );
  }
  const before = meter.value;
  const after = Math.min(before, target);
  const next = { ...meter, cap: target, value: after };
  return { meter: next, change: buildChange(next, before, after, target, 0) };
}

export function setMeterFloor(
  meter: Meter,
  floor: number,
): { meter: Meter; change: MeterChange } {
  const target = requireInt(floor, `${meter.name}: floor`);
  if (target < meter.min || target > meter.cap) {
    throw new MeterError(
      `${meter.name}: floor ${target} must be between min ${meter.min} and cap ${meter.cap}.`,
    );
  }
  const before = meter.value;
  const after = Math.max(before, target);
  const next = { ...meter, floor: target, value: after };
  return { meter: next, change: buildChange(next, before, after, target, 0) };
}

/** The highest threshold with at <= value, if any. */
export function currentThreshold(meter: Meter): MeterThreshold | undefined {
  let found: MeterThreshold | undefined;
  for (const t of meter.thresholds || []) {
    if (t.at <= meter.value && (!found || t.at > found.at)) found = t;
  }
  return found;
}

export function isDuplicate(
  keys: MeterDedupKey[],
  id: string,
  key: string,
  scope: "scene" | "session",
  at: number,
): boolean {
  const k = normalizeKey(key);
  return keys.some(
    (d) => d.meterId === id && d.key === k && d.scope === scope && d.at === at,
  );
}

/** Drops keys whose scene or session has passed. */
export function pruneDedupKeys(
  keys: MeterDedupKey[],
  sceneCount: number,
  sessionCount: number,
): MeterDedupKey[] {
  return keys.filter((d) =>
    d.scope === "scene" ? d.at === sceneCount : d.at === sessionCount,
  );
}

export function filledBoxes(ticks: number): number {
  return Math.floor(ticks / 4);
}

export function createTrack(
  owner: string,
  name: string,
  kind: TrackKind,
  rank: TrackRank,
): ProgressTrack {
  const n = (name ?? "").trim();
  const o = (owner ?? "").trim();
  if (!n) throw new MeterError("A track needs a name.");
  if (!o) throw new MeterError("A track needs an owner.");
  if (!(rank in TICKS_PER_MARK)) {
    throw new MeterError(`Unknown rank "${String(rank)}".`);
  }
  return {
    id: trackId(o, n),
    owner: o,
    name: n,
    kind,
    rank,
    ticks: 0,
    status: "active",
  };
}

export function markProgress(
  track: ProgressTrack,
  times = 1,
): {
  track: ProgressTrack;
  ticksAdded: number;
  boxesBefore: number;
  boxesAfter: number;
} {
  const n = requireInt(times, `${track.name}: times`);
  if (n < 1) throw new MeterError(`${track.name}: times must be at least 1.`);
  const wanted = TICKS_PER_MARK[track.rank] * n;
  const ticks = Math.min(TRACK_MAX_TICKS, track.ticks + wanted);
  return {
    track: { ...track, ticks },
    ticksAdded: ticks - track.ticks,
    boxesBefore: filledBoxes(track.ticks),
    boxesAfter: filledBoxes(ticks),
  };
}

/** The book's "progress reduced to half its boxes, rounded down". */
export function halveTrack(track: ProgressTrack): ProgressTrack {
  const boxes = Math.floor(filledBoxes(track.ticks) / 2);
  return { ...track, ticks: boxes * 4 };
}

export type RollOutcome = "strong_hit" | "weak_hit" | "miss";

/** A score beats a challenge die only when strictly greater; ties go to the dice. */
export function resolveAgainstChallengeDice(
  score: number,
  c1: number,
  c2: number,
): { outcome: RollOutcome; match: boolean } {
  const beats = (score > c1 ? 1 : 0) + (score > c2 ? 1 : 0);
  const outcome: RollOutcome =
    beats === 2 ? "strong_hit" : beats === 1 ? "weak_hit" : "miss";
  return { outcome, match: c1 === c2 };
}

export function actionScore(
  die: number,
  stat: number,
  adds: number,
  penalty: number,
): { score: number; addsApplied: number; capped: boolean } {
  const addsApplied = clamp(Math.floor(adds || 0), 0, ACTION_ADDS_CAP);
  const raw = die + stat + addsApplied - (penalty || 0);
  return {
    score: Math.min(raw, ACTION_SCORE_CAP),
    addsApplied,
    capped: raw > ACTION_SCORE_CAP,
  };
}
