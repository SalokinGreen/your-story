/**
 * Countdown timers become manual clocks (design section 4 and 11, plan
 * "Revised after Codex's review"). Nothing is deleted from an old save: the
 * timers stay where they were and the clocks are added beside them.
 */

import type { CountdownTimer, StoryData } from "../structs";
import { emptyCampaign } from "./types";
import type { CampaignRecord, Clock } from "./types";

/** One timer as a clock. Any capacity is kept; filled = total - remaining. */
export function timerToClock(timer: CountdownTimer): Clock {
  const segments = Math.max(1, Math.floor(Number(timer.totalTicks) || 1));
  const remaining = Math.max(0, Math.min(segments, Math.floor(Number(timer.currentTicks) || 0)));
  const triggered = timer.status === "triggered";
  const cancelled = timer.status === "cancelled";
  const clock: Clock = {
    id: timer.id,
    name: timer.name,
    segments,
    filled: triggered ? segments : segments - remaining,
    triggers: ["manual"],
    visible: timer.visibility !== "hidden",
    paused: timer.status === "paused" || cancelled,
    crossed: [],
    migratedFromTimerId: timer.id,
  };
  if (timer.description) clock.onFill = timer.description;
  if (cancelled) clock.cancelled = true;
  return clock;
}

/**
 * Adds a clock for every timer that has none yet, keyed by
 * `migratedFromTimerId`, so running it again changes nothing. A story with
 * timers and no record gets a record with empty lists, marked
 * `origin: "migrated"`. Returns true when it changed the story.
 */
export function migrateTimers(story: StoryData): boolean {
  const timers = Array.isArray(story.timers) ? story.timers : [];
  if (timers.length === 0) return false;
  let record: CampaignRecord | undefined = story.campaign;
  let created = false;
  if (!record) {
    record = { ...emptyCampaign(), origin: "migrated" };
    created = true;
  }
  const done = new Set(
    record.clocks.map((c) => c.migratedFromTimerId).filter((id): id is string => !!id),
  );
  const known = new Set(record.clocks.map((c) => c.id));
  let changed = created;
  for (const timer of timers) {
    if (done.has(timer.id) || known.has(timer.id)) continue;
    record.clocks.push(timerToClock(timer));
    done.add(timer.id);
    changed = true;
  }
  if (created) story.campaign = record;
  return changed;
}
