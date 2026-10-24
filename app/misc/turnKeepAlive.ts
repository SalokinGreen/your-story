/**
 * Keeps a turn alive when the player leaves the app on Android (decision 132,
 * docs/android-background-design.md §3.1).
 *
 * The native half is `TurnKeepAlivePlugin` / `TurnKeepAliveService` in the
 * Android project: a dataSync foreground service whose ongoing notification
 * stops Android freezing the WebView while a model call is in flight, and a
 * "your turn is ready" notification for a turn that finished while the player
 * was away.
 *
 * Everything here is a no-op off Android and fire-and-forget on it: a native
 * failure goes to the Debug Logs and is never thrown into the turn.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { logger } from "./logger";

interface TurnKeepAlivePlugin {
  begin(options: { turnId: string }): Promise<void>;
  end(options: { turnId: string }): Promise<void>;
  notifyReady(options: {
    turnId: string;
    title: string;
    body: string;
  }): Promise<void>;
  notifyAttention(options: { title: string; body: string }): Promise<void>;
  requestNotificationPermission(): Promise<void>;
}

export type TurnKeepAliveOutcome = "ready" | "stopped" | "failed";

/** Remembers that the notification permission has been asked on this device. */
export const PERMISSION_ASKED_KEY = "ys:turnKeepAlive:permissionAsked";

const TurnKeepAlive = registerPlugin<TurnKeepAlivePlugin>("TurnKeepAlive");

function isAndroid(): boolean {
  try {
    return Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

/** Runs one native call; any failure (sync or async) becomes a Debug Logs line. */
function fire(label: string, call: () => Promise<void>): void {
  try {
    call().catch((error: unknown) => {
      logger.warn(`Turn keep-alive: ${label} failed`, {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  } catch (error) {
    logger.warn(`Turn keep-alive: ${label} failed`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** A fresh id for one turn; the native side orders its calls by it. */
export function newTurnId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Call as a turn starts, while the app is still on screen (Android only lets a
 * foreground service start then). The first call on a device also asks for the
 * notification permission, alongside and never awaited: the service runs
 * without it, and only its notification is hidden.
 */
export function beginTurnKeepAlive(turnId: string): void {
  if (!isAndroid()) return;
  fire("begin", () => TurnKeepAlive.begin({ turnId }));

  let asked = false;
  try {
    asked = localStorage.getItem(PERMISSION_ASKED_KEY) === "1";
  } catch {
    asked = true; // storage unavailable: do not nag on every turn
  }
  if (asked) return;
  try {
    localStorage.setItem(PERMISSION_ASKED_KEY, "1");
  } catch {
    // Nothing to do; the worst case is a second prompt next turn.
  }
  fire("requestNotificationPermission", () =>
    TurnKeepAlive.requestNotificationPermission(),
  );
}

/**
 * Call once the turn is over and its final save has settled. `"ready"` also
 * sends the "your turn is ready" ping after it, which the native side posts only
 * while the app is in the background.
 */
export function endTurnKeepAlive(
  turnId: string,
  outcome: TurnKeepAliveOutcome,
  storyName?: string,
): void {
  if (!isAndroid()) return;
  // End first: the native side posts "ready" only for the id it last ended.
  fire("end", () => TurnKeepAlive.end({ turnId }));
  if (outcome === "ready") {
    fire("notifyReady", () =>
      TurnKeepAlive.notifyReady({
        turnId,
        title: "Your turn is ready",
        body: storyName?.trim() || "Endless Adventure",
      }),
    );
  }
}

/** What the GM is waiting on when a turn pauses for the player. */
export type PlayerPause = "question" | "roll";

/**
 * Call when a turn pauses on the player (ask_question, a manual roll, a dice
 * throw). The native side posts it only while the app is in the background,
 * since otherwise the prompt is already on screen.
 */
export function notifyPlayerNeeded(kind: PlayerPause, detail?: string): void {
  if (!isAndroid()) return;
  const title =
    kind === "question"
      ? "The GM has a question for you"
      : "The GM needs a roll from you";
  const body = detail?.trim() ? detail.trim().slice(0, 240) : "Endless Adventure";
  fire("notifyAttention", () =>
    TurnKeepAlive.notifyAttention({ title, body }),
  );
}
