/**
 * Sends one feedback submission to the Worker (`POST <sync URL>/feedback`).
 *
 * Imports nothing from sync: no sync key, no sync headers, no Authorization
 * header of any kind. It shares the Worker's address with sync
 * (NEXT_PUBLIC_SYNC_API_URL) and nothing else, and it is available whenever
 * that address is set, whether or not the player has sync switched on.
 * It never retries on its own: a failed send comes back as a reason, the form
 * keeps its draft (and the draft's id, so the Worker stores a retry once).
 */
import { getProviderFetch } from "./platformFetch";
import type { FeedbackSubmission } from "./feedback";

export type FeedbackFailure =
  | "offline"
  | "rate_limited"
  | "daily_cap"
  | "too_large"
  | "invalid"
  | "disabled"
  | "server";

export type FeedbackResult =
  | { ok: true; ref: string }
  | { ok: false; reason: FeedbackFailure };

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_SYNC_API_URL || "").replace(/\/+$/, "");
}

/** The Worker address is baked into the build; the entries show only when it is set. */
export function feedbackAvailable(): boolean {
  return baseUrl() !== "";
}

export function feedbackUrl(): string {
  return `${baseUrl()}/feedback`;
}

async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body?.error === "string" ? body.error : undefined;
  } catch {
    return undefined;
  }
}

export async function sendFeedback(
  sub: FeedbackSubmission,
  signal?: AbortSignal,
): Promise<FeedbackResult> {
  if (!feedbackAvailable()) return { ok: false, reason: "disabled" };

  let res: Response;
  try {
    res = await getProviderFetch()(feedbackUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
      signal,
    });
  } catch (e) {
    // A closed form aborts the send; that is not a failure to report.
    if (e instanceof Error && e.name === "AbortError") throw e;
    return { ok: false, reason: "offline" };
  }

  if (res.status === 200) {
    try {
      const body = (await res.json()) as { ok?: unknown; ref?: unknown };
      if (body?.ok === true) {
        return {
          ok: true,
          ref: typeof body.ref === "string" && body.ref ? body.ref : sub.id.slice(0, 8),
        };
      }
    } catch {
      // Fall through: a 200 that is not our JSON is not a stored submission.
    }
    return { ok: false, reason: "server" };
  }
  if (res.status === 400) return { ok: false, reason: "invalid" };
  if (res.status === 413) return { ok: false, reason: "too_large" };
  if (res.status === 429) {
    return {
      ok: false,
      reason: (await errorCode(res)) === "daily_cap" ? "daily_cap" : "rate_limited",
    };
  }
  if (res.status === 503) return { ok: false, reason: "disabled" };
  return { ok: false, reason: "server" };
}

/** What the form says for each failure; the draft is kept in every case. */
export const FEEDBACK_FAILURE_MESSAGES: Record<FeedbackFailure, string> = {
  offline:
    "Couldn't reach the feedback server. Check your connection and try again; your draft is kept.",
  rate_limited: "That's a lot of feedback at once. Wait a minute and try again.",
  daily_cap: "The feedback box is full for today. Try again tomorrow; your draft is kept.",
  too_large: "That is too large to send. Shorten the text or the attached turn.",
  invalid: "The server didn't accept that. Check the rating and the text, then try again.",
  disabled: "Feedback is switched off right now.",
  server: "The feedback server had a problem. Try again in a while; your draft is kept.",
};
