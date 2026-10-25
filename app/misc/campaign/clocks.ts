/**
 * The clock logic (docs/campaign-format-design.md section 4 and 14.2). Pure:
 * no I/O, no ids, no clock time. The engine ticks a clock; it never writes the
 * prose that follows (the GM narrates a portent or a fill).
 */

import type {
  CampaignRecord,
  CampaignStyle,
  Clock,
  ClockTrigger,
  Front,
  Portent,
} from "./types";

// ---------------------------------------------------------------------------
// Visibility and portents
// ---------------------------------------------------------------------------

/** Decision 231: shown for sandbox, adventure path and slice of life; hidden for mystery and horror. */
export function defaultClockVisibility(style: CampaignStyle | undefined): boolean {
  return style !== "mystery" && style !== "horror";
}

/**
 * Spreads a front's portents evenly across a clock of `segments`: three
 * portents on six segments sit at 2, 4 and 6. Only the texts are used; any
 * `at` already on them is replaced.
 */
export function defaultPortents(front: Pick<Front, "portents">, segments: number): Portent[] {
  const n = front.portents.length;
  if (n === 0 || segments < 1) return [];
  return front.portents.map((p, i) => ({
    at: Math.max(1, Math.min(segments, Math.ceil(((i + 1) * segments) / n))),
    text: p.text,
  }));
}

/**
 * The portents as they will fire on a clock of `segments`. When the author set
 * every `at` (all above zero) they are used as written; otherwise the whole
 * list is spread evenly, so a portent never fires at fill zero.
 */
export function effectivePortents(front: Pick<Front, "portents">, segments: number): Portent[] {
  if (front.portents.length > 0 && front.portents.every((p) => p.at > 0)) {
    return front.portents.map((p) => ({ at: Math.min(p.at, segments), text: p.text }));
  }
  return defaultPortents(front, segments);
}

/** The front a clock belongs to, from either side of the link. */
export function frontForClock(
  record: Pick<CampaignRecord, "fronts">,
  clock: Pick<Clock, "id" | "link">,
): Front | undefined {
  return record.fronts.find(
    (f) =>
      f.clockId === clock.id ||
      (clock.link?.kind === "front" && clock.link.id === f.id),
  );
}

// ---------------------------------------------------------------------------
// tickClock
// ---------------------------------------------------------------------------

export interface TickResult {
  clock: Clock;
  /** Portents reached by this tick that were never reported before. */
  crossed: Portent[];
  /** True when this tick took the clock from not full to full. */
  filled: boolean;
  /** How far the fill actually moved (after clamping), signed. */
  applied: number;
  /** Set when nothing moved because the clock cannot be ticked. */
  refused?: "paused" | "cancelled";
  reason?: string;
}

/**
 * Moves a clock by `by` (negative unticks), clamped to [0, segments]. A paused
 * or cancelled clock does not move. Each portent is reported once, ever: the
 * `at` values already reported are kept on the clock, so an untick and a
 * refill cannot report one twice. The record is only read, for the linked
 * front's portents; a clock with no front has none.
 */
export function tickClock(
  clock: Clock,
  by: number,
  reason: string | undefined,
  record: Pick<CampaignRecord, "fronts">,
): TickResult {
  if (clock.cancelled) {
    return { clock, crossed: [], filled: false, applied: 0, refused: "cancelled", reason };
  }
  if (clock.paused) {
    return { clock, crossed: [], filled: false, applied: 0, refused: "paused", reason };
  }
  const step = Number.isFinite(by) ? Math.trunc(by) : 0;
  const before = clock.filled;
  const after = Math.max(0, Math.min(clock.segments, before + step));
  const next: Clock = { ...clock, filled: after, crossed: [...clock.crossed] };
  const crossed: Portent[] = [];
  if (after > before) {
    const front = frontForClock(record, clock);
    if (front) {
      for (const p of effectivePortents(front, clock.segments)) {
        if (p.at <= after && !next.crossed.includes(p.at)) {
          crossed.push(p);
        }
      }
      for (const p of crossed) {
        if (!next.crossed.includes(p.at)) next.crossed.push(p.at);
      }
    }
  }
  return {
    clock: next,
    crossed,
    filled: before < clock.segments && after >= clock.segments,
    applied: after - before,
    reason,
  };
}

// ---------------------------------------------------------------------------
// The turn's event ledger and the ticks it produces
// ---------------------------------------------------------------------------

/** Something that happened this turn that a clock may tick on. */
export interface TurnEvent {
  kind: ClockTrigger;
  toolCallId: string;
  order: number;
}

/**
 * Kept for the whole turn, across the GM's rounds (design 14.2): the events so
 * far, which (clock, trigger) pairs have already ticked this turn, and the
 * order at which each clock created this turn came to exist.
 */
export interface TurnLedger {
  events: TurnEvent[];
  /** `${clockId}:${trigger}` keys already ticked this turn. */
  consumed: string[];
  /** clockId -> the `order` that was next when the clock was created this turn. */
  clockCreatedAt: Record<string, number>;
  nextOrder: number;
}

export function newTurnLedger(): TurnLedger {
  return { events: [], consumed: [], clockCreatedAt: {}, nextOrder: 0 };
}

export function consumedKey(clockId: string, kind: ClockTrigger): string {
  return `${clockId}:${kind}`;
}

export interface ClockTickPlan {
  clockId: string;
  kind: ClockTrigger;
  toolCallId: string;
}

/**
 * The ticks the given events produce, in event order: one per trigger per
 * clock per turn (`ledger.consumed` holds what already ticked), none for a
 * paused, cancelled or full clock, none for a trigger the clock does not list,
 * and none for an event older than the clock itself (a clock created this turn
 * starts ticking from the next event). A manual event never ticks anything.
 * Pure: the caller records the keys it applies.
 */
export function ticksForEvents(
  record: Pick<CampaignRecord, "clocks">,
  events: TurnEvent[],
  ledger: Pick<TurnLedger, "consumed" | "clockCreatedAt">,
): ClockTickPlan[] {
  const taken = new Set(ledger.consumed);
  const plans: ClockTickPlan[] = [];
  const ordered = [...events].sort((a, b) => a.order - b.order);
  for (const ev of ordered) {
    if (ev.kind === "manual") continue;
    for (const clock of record.clocks) {
      if (clock.paused || clock.cancelled) continue;
      if (clock.filled >= clock.segments) continue;
      if (!clock.triggers.includes(ev.kind)) continue;
      const born = ledger.clockCreatedAt[clock.id];
      if (born !== undefined && ev.order < born) continue;
      const key = consumedKey(clock.id, ev.kind);
      if (taken.has(key)) continue;
      taken.add(key);
      plans.push({ clockId: clock.id, kind: ev.kind, toolCallId: ev.toolCallId });
    }
  }
  return plans;
}

export interface ClockReport {
  clockId: string;
  name: string;
  filled: number;
  segments: number;
  kind: ClockTrigger | "manual";
  visible: boolean;
  portents: string[];
  full: boolean;
  /** The line the GM sees. */
  line: string;
}

/** The GM-facing line for a tick (also used for the campaign tool's manual ticks). */
export function describeTick(
  clock: Clock,
  before: number,
  result: Pick<TickResult, "crossed" | "filled">,
  record: Pick<CampaignRecord, "fronts">,
  cause: string,
): string {
  const hidden = clock.visible ? "" : " (hidden)";
  let line = `[Clock${hidden} "${clock.name}" ${before}/${clock.segments} → ${clock.filled}/${clock.segments} (${cause})`;
  for (const p of result.crossed) line += `. Portent reached: ${p.text}`;
  if (result.filled) {
    const front = frontForClock(record, clock);
    const fate = clock.onFill || front?.doom;
    line += `. FULL${fate ? `: ${fate}` : ""}. Narrate it; the engine does not write the prose`;
  }
  return line + "]";
}

/**
 * Applies the ticks `events` earn to `record`'s clocks, in order, mutating the
 * record (the executor's working copy) and returning the new ledger plus a
 * report per tick. The events are appended to the ledger and each applied
 * (clock, trigger) pair is consumed. Call it after each tool, so a pause
 * earlier in a batch is honoured by a miss later in it.
 */
export function applyTurnEvents(
  record: CampaignRecord,
  ledger: TurnLedger,
  fresh: { kind: ClockTrigger; toolCallId: string }[],
): { ledger: TurnLedger; reports: ClockReport[] } {
  const next: TurnLedger = {
    events: [...ledger.events],
    consumed: [...ledger.consumed],
    clockCreatedAt: { ...ledger.clockCreatedAt },
    nextOrder: ledger.nextOrder,
  };
  const added: TurnEvent[] = fresh.map((e) => ({
    kind: e.kind,
    toolCallId: e.toolCallId,
    order: next.nextOrder++,
  }));
  next.events.push(...added);
  const reports: ClockReport[] = [];
  for (const plan of ticksForEvents(record, added, next)) {
    const idx = record.clocks.findIndex((c) => c.id === plan.clockId);
    if (idx < 0) continue;
    const before = record.clocks[idx].filled;
    const result = tickClock(record.clocks[idx], 1, plan.kind, record);
    next.consumed.push(consumedKey(plan.clockId, plan.kind));
    if (result.refused || result.applied === 0) continue;
    record.clocks[idx] = result.clock;
    reports.push({
      clockId: result.clock.id,
      name: result.clock.name,
      filled: result.clock.filled,
      segments: result.clock.segments,
      kind: plan.kind,
      visible: result.clock.visible,
      portents: result.crossed.map((p) => p.text),
      full: result.filled,
      line: describeTick(result.clock, before, result, record, plan.kind),
    });
  }
  return { ledger: next, reports };
}
