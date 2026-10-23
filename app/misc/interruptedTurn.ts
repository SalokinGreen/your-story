// A record of the turn in flight, so a turn the OS killed mid-way (Android
// reclaiming the app, a crash, a closed tab) is noticed on the next load
// (decision 135). The page writes it when a turn starts and clears it once the
// turn's final save has resolved, so a record that is still there on load means
// the turn never finished. It lives in localStorage beside the story, per
// story, and is deliberately NOT on the sync allowlist: it describes this
// device's process, not the story.

import type { StoryData } from "./structs";

export interface InterruptedTurn {
  storyId: string;
  /** Ties the record to one run of the wrapper, so a late clear can't erase a newer turn's. */
  turnId: string;
  /** "new": a fresh player line, resend it. "retry": a reroll/reword, run Retry again. */
  mode: "new" | "retry";
  /** The player's line, for the banner's Retry (and display). */
  text: string;
  /** scene.parts.length before the turn touched anything. */
  partsBefore: number;
  startedAt: number;
}

/** A record older than this is stale: dropped on read instead of offered. */
export const INTERRUPTED_TURN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Turn ids running in THIS JS process. The story page never aborts a turn on
// unmount, so a turn can still be live while its record is on disk; a reload
// of the same story in this process must not read that record as interrupted.
const liveTurnIds = new Set<string>();

/** Test-only: forgets the live ids, as a process restart would. */
export function resetLiveTurnIdsForTests(): void {
  liveTurnIds.clear();
}

const keyFor = (storyId: string) => `ys:interruptedTurn:${storyId}`;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function markTurnStarted(rec: InterruptedTurn): void {
  liveTurnIds.add(rec.turnId);
  try {
    storage()?.setItem(keyFor(rec.storyId), JSON.stringify(rec));
  } catch {
    // Storage full or blocked: the turn still runs, it just can't be recovered.
  }
}

/** The turn is over in this process but its record is kept (its final save failed). */
export function markTurnEnded(turnId: string): void {
  liveTurnIds.delete(turnId);
}

/** Clears the record only if it belongs to `turnId`. */
export function clearTurn(storyId: string, turnId: string): void {
  liveTurnIds.delete(turnId);
  try {
    const store = storage();
    if (!store) return;
    const raw = store.getItem(keyFor(storyId));
    if (!raw) return;
    const rec = JSON.parse(raw) as Partial<InterruptedTurn> | null;
    if (rec?.turnId === turnId) store.removeItem(keyFor(storyId));
  } catch {
    // Unreadable record: leave it; readInterruptedTurn drops what it can't parse.
  }
}

/** The story's pending record, or null. Drops (and returns null for) a stale or corrupt one. */
export function readInterruptedTurn(
  storyId: string,
  now: number,
): InterruptedTurn | null {
  try {
    const store = storage();
    if (!store) return null;
    const raw = store.getItem(keyFor(storyId));
    if (!raw) return null;
    const rec = JSON.parse(raw) as Partial<InterruptedTurn> | null;
    if (
      !rec ||
      rec.storyId !== storyId ||
      typeof rec.turnId !== "string" ||
      (rec.mode !== "new" && rec.mode !== "retry") ||
      typeof rec.text !== "string" ||
      typeof rec.partsBefore !== "number" ||
      typeof rec.startedAt !== "number" ||
      now - rec.startedAt > INTERRUPTED_TURN_MAX_AGE_MS
    ) {
      store.removeItem(keyFor(storyId));
      return null;
    }
    // Live in this process: the turn is still running, not interrupted. Keep the record.
    if (liveTurnIds.has(rec.turnId)) return null;
    return rec as InterruptedTurn;
  } catch {
    return null;
  }
}

/** Removes whatever the killed turn left in the story: cuts scene.parts back to where it began. */
export function repairInterruptedStory(
  story: StoryData,
  rec: InterruptedTurn,
): StoryData {
  if (story.scene.parts.length > rec.partsBefore) {
    story.scene.parts.length = Math.max(0, rec.partsBefore);
  }
  // A killed full reroll leaves the part it was rewriting emptied.
  if (rec.mode === "retry") {
    const last = story.scene.parts[story.scene.parts.length - 1];
    if (
      last &&
      last.role === "assistant" &&
      (last.content ?? "").trim() === ""
    ) {
      story.scene.parts.pop();
    }
  }
  return story;
}
