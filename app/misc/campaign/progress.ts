/**
 * Story progress derived from the campaign record (design 14.6). Returns a
 * fraction from 0 to 1, the same unit as `storyProgress` in mythic.ts, which
 * calls this when the record has a style and keeps its chapter-based value
 * otherwise.
 */

import type { CampaignRecord } from "./types";

/** A sandbox or any open-ended style never reaches 100%. */
export const OPEN_ENDED_PROGRESS_CAP = 0.9;

export function deriveStoryProgress(record: CampaignRecord): number {
  const ratio = (done: number, total: number): number =>
    total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;

  switch (record.style) {
    case "adventure_path": {
      const beats = record.beats?.list ?? [];
      return ratio(beats.filter((b) => b.status === "done").length, beats.length);
    }
    case "mystery":
      return ratio(record.secrets.filter((s) => s.revealed).length, record.secrets.length);
    default: {
      const done = record.fronts.filter((f) => f.status === "resolved" || f.status === "doomed").length;
      return Math.min(OPEN_ENDED_PROGRESS_CAP, ratio(done, record.fronts.length));
    }
  }
}
