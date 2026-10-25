/**
 * "How was tonight?" (design §6.4, decision 192): the pure decision of whether
 * the after-a-night card shows, and the device-local markers behind it.
 *
 * Everything lives in localStorage on this device and none of it is on the
 * sync allowlist (syncableSettingsKeys.ts): whether you were asked, and what
 * you answered, describes this device.
 */

/** The Settings switch "Ask for feedback after a night". On unless set to "false". */
export const AFTER_NIGHT_KEY = "ys:feedbackAfterNight";
/** Dispatched on window when the switch or a marker changes, so the story screen re-reads them. */
export const FEEDBACK_STATE_EVENT = "ys:feedbackState";

export type SessionMarker = "offered" | "dismissed" | "sent";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function announce(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FEEDBACK_STATE_EVENT));
  }
}

export function afterNightEnabled(storage: StorageLike | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(AFTER_NIGHT_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setAfterNightEnabled(
  on: boolean,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(AFTER_NIGHT_KEY, on ? "true" : "false");
  } catch {
    // A full or blocked store only means the switch is not remembered.
  }
  announce();
}

export function sessionMarkerKey(storyId: string, session: number): string {
  return `ys:feedbackSession:${storyId}:${session}`;
}

export function readSessionMarker(
  storyId: string,
  session: number,
  storage: StorageLike | null = defaultStorage(),
): SessionMarker | null {
  try {
    const raw = storage?.getItem(sessionMarkerKey(storyId, session));
    return raw === "offered" || raw === "dismissed" || raw === "sent" ? raw : null;
  } catch {
    return null;
  }
}

export function writeSessionMarker(
  storyId: string,
  session: number,
  marker: SessionMarker,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(sessionMarkerKey(storyId, session), marker);
  } catch {
    // Unwritable: the card may show again next time. Harmless.
  }
  announce();
}

/**
 * The night this saved turn ended, or null. Counts only an EXECUTED
 * `end_session`: a tool result that succeeded and carries
 * `result.type === "end_session"` (the shape executeEndSession returns, saved
 * on the part as `gmToolCalls`). A failed call, a refused one, or a turn that
 * only mentions the night does not count.
 */
export function endedSessionOf(part: {
  user?: boolean;
  gmToolCalls?: ReadonlyArray<unknown>;
}): number | null {
  if (part.user) return null;
  for (const call of part.gmToolCalls ?? []) {
    const c = call as {
      success?: boolean;
      toolName?: string;
      result?: { type?: string; sessionCount?: unknown };
    } | null;
    if (!c || c.success !== true || c.toolName !== "end_session") continue;
    if (c.result?.type !== "end_session") continue;
    const n = c.result.sessionCount;
    if (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 10000) return n;
  }
  return null;
}

export interface SessionOfferFlags {
  /** Couch co-op: one shared screen. */
  couch: boolean;
  /** Party mode's table is open. */
  party: boolean;
  /** An online room, host or guest. */
  online: boolean;
  /** The Settings switch. */
  enabled: boolean;
  /** The Worker address is set in this build. */
  available: boolean;
}

export interface SessionOffer {
  partIndex: number;
  session: number;
}

/**
 * Where the after-a-night card shows, if anywhere: under the newest saved
 * turn with an executed `end_session`, never in a shared-screen or online
 * session, never with the switch off, and not once the player has dismissed it
 * or sent feedback for that night. "offered" (shown, not yet acted on) still
 * shows, so reloading mid-night does not lose the ask.
 */
export function sessionFeedbackOffer(
  parts: ReadonlyArray<{ user?: boolean; gmToolCalls?: ReadonlyArray<unknown> }>,
  flags: SessionOfferFlags,
  markerFor: (session: number) => SessionMarker | null,
): SessionOffer | null {
  if (!flags.available || !flags.enabled) return null;
  if (flags.couch || flags.party || flags.online) return null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const session = endedSessionOf(parts[i]);
    if (session === null) continue;
    const marker = markerFor(session);
    if (marker === "dismissed" || marker === "sent") return null;
    return { partIndex: i, session };
  }
  return null;
}
