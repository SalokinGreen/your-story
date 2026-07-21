/**
 * Deterministic pacing feedback (Layer 3 - director/pacing).
 *
 * "LLM proposes, deterministic engine disposes": the model writes the prose,
 * but the engine measures how much the *player actually has to read* each turn
 * (the narration stored in ScenePart.content) and, when replies drift away from
 * the length the player asked for via the Reply Length setting, injects a short
 * corrective nudge into the next turn's prompt. This is a non-blocking hint,
 * never a hard gate - the model still decides the exact wording.
 *
 * By design it reacts to a *trend* (a trailing average over the last few
 * assistant turns), not a single turn, so one legitimately long combat climax
 * or one terse one-liner won't trip it.
 */
import type { ScenePart } from "@/app/misc/structs";
import type { ReplyLength } from "@/app/misc/ai_staged";

/** How many recent assistant narration turns feed the trailing average. */
export const PACING_WINDOW = 3;

/** Minimum assistant turns of history before we're willing to nudge at all. */
export const PACING_MIN_HISTORY = 2;

/**
 * Per-setting acceptable band for the trailing average words-per-turn. Below
 * `low` reads as consistently terse; above `high` reads as consistently
 * long-winded. The midpoints line up with getLengthGuidance() in ai_staged.ts
 * (Short ~1-2 sentences, Medium ~1 paragraph, Long ~2-4 paragraphs); the bands
 * are deliberately wide so normal moment-to-moment variation stays in "ok".
 */
export const PACING_BANDS: Record<
  ReplyLength,
  { low: number; high: number }
> = {
  short: { low: 12, high: 85 },
  medium: { low: 30, high: 170 },
  long: { low: 80, high: 300 },
};

export type PacingStatus = "ok" | "long" | "short";

export interface PacingFeedback {
  status: PacingStatus;
  /** Trailing average words per assistant turn over the window sampled. */
  avgWords: number;
  /** How many assistant turns actually contributed to the average. */
  sampled: number;
  band: { low: number; high: number };
  /**
   * Corrective prompt line to inject, or undefined when status is "ok" (or
   * there isn't enough history yet to judge).
   */
  message?: string;
}

/**
 * Counts the words a player has to read in a narration string. Whitespace
 * split after trimming; empty/whitespace-only content counts as 0.
 */
export function countNarrationWords(content: string | undefined | null): number {
  if (!content) return 0;
  const trimmed = content.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Computes pacing feedback from the story's scene parts against the current
 * Reply Length setting. Pure and deterministic - safe to call every turn.
 */
export function computePacingFeedback(
  parts: ScenePart[] | undefined,
  replyLength: ReplyLength = "medium",
): PacingFeedback {
  const band = PACING_BANDS[replyLength] ?? PACING_BANDS.medium;

  // Only the AI's player-visible narration counts - skip the player's own
  // turns and any empty assistant parts.
  const recentCounts: number[] = [];
  for (let i = (parts?.length ?? 0) - 1; i >= 0; i--) {
    const part = parts![i];
    if (part.user || part.role !== "assistant") continue;
    const words = countNarrationWords(part.content);
    if (words === 0) continue;
    recentCounts.push(words);
    if (recentCounts.length >= PACING_WINDOW) break;
  }

  if (recentCounts.length < PACING_MIN_HISTORY) {
    return { status: "ok", avgWords: 0, sampled: recentCounts.length, band };
  }

  const avgWords = Math.round(
    recentCounts.reduce((a, b) => a + b, 0) / recentCounts.length,
  );

  let status: PacingStatus = "ok";
  if (avgWords > band.high) status = "long";
  else if (avgWords < band.low) status = "short";

  return {
    status,
    avgWords,
    sampled: recentCounts.length,
    band,
    message: buildPacingMessage(status, avgWords, recentCounts.length, replyLength),
  };
}

function buildPacingMessage(
  status: PacingStatus,
  avgWords: number,
  sampled: number,
  replyLength: ReplyLength,
): string | undefined {
  if (status === "ok") return undefined;
  const turns = sampled === 1 ? "reply" : `${sampled} replies`;
  if (status === "long") {
    return `PACING FEEDBACK: Your last ${turns} averaged ~${avgWords} words, which runs longer than the current "${replyLength}" reply-length setting. Write noticeably shorter this turn - trim description, cut straight to the beat, and hand control back sooner.`;
  }
  return `PACING FEEDBACK: Your last ${turns} averaged only ~${avgWords} words, a touch terse for the current "${replyLength}" reply-length setting. You have room for a little more texture where the moment calls for it - but still stop at the decision point and don't pad.`;
}
