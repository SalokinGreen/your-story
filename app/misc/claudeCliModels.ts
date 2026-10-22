/**
 * The Claude subscription models (docs/claude-gm-design.md §4.3) and what the
 * rest of the app needs to know about them without loading the CLI bridge:
 * their keys, the model each is pinned to, whether this device can run the
 * `claude` CLI at all, and the CLI's sign-in status for Settings.
 *
 * Kept apart from claudeCli.ts (the bridge itself) because ai_prices.ts and
 * reasoningTiers.ts need these, and the bridge imports providerCall.ts, which
 * imports ai_prices.ts.
 */

import { invoke, isTauri } from "@tauri-apps/api/core";
import { logger } from "./logger";

export type ClaudeCliModelKey =
  | "Claude Opus (subscription)"
  | "Claude Sonnet (subscription)"
  | "Claude Haiku (subscription)";

/** The CLI's model families, as the Rust command takes them. */
export type ClaudeCliFamily = "opus" | "sonnet" | "haiku";

export const CLAUDE_CLI_MODELS: Record<
  ClaudeCliModelKey,
  { family: ClaudeCliFamily; pinnedId: string }
> = {
  "Claude Opus (subscription)": { family: "opus", pinnedId: "claude-opus-5-5" },
  "Claude Sonnet (subscription)": { family: "sonnet", pinnedId: "claude-sonnet-5-5" },
  "Claude Haiku (subscription)": { family: "haiku", pinnedId: "claude-haiku-5-5" },
};

export function isClaudeCliModel(model: string | undefined | null): model is ClaudeCliModelKey {
  return !!model && Object.prototype.hasOwnProperty.call(CLAUDE_CLI_MODELS, model);
}

/**
 * Only the desktop app can launch the CLI. True in the Tauri shell (also
 * under `tauri dev`, which is not a standalone build); false on the web and
 * in the Capacitor apps.
 */
export function isClaudeCliAvailablePlatform(): boolean {
  return isTauri();
}

// ============================================================
// Online play (decisions 29 and 30)
// ============================================================
// In an online multiplayer game (host or guest, NetSession) other people's
// devices feed the host's turns, and design §5.2 forbids relaying another
// device's requests through the player's subscription. So while a session is
// active a subscription model is treated as one this device cannot run: each
// slot uses its default and Settings says why (decision 29). Solo play and
// couch co-op on one device are unaffected, and so is party mode (friends'
// phones as controllers for the host's own game), which counts like couch
// co-op (decision 30) - nothing here looks at it.

/** Fired on window when the online session starts or ends. */
export const ONLINE_SESSION_EVENT = "claude-cli-online-session-changed";

let onlineSessionActive = false;

/** Called by useNetSession whenever its session starts or ends. */
export function setOnlineSessionActive(active: boolean): void {
  if (onlineSessionActive === active) return;
  onlineSessionActive = active;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ONLINE_SESSION_EVENT));
  }
}

export function isOnlineSessionActive(): boolean {
  return onlineSessionActive;
}

/**
 * Whether a subscription model can run right now: on the desktop app, and
 * not during an online session. The one question every fallback asks.
 */
export function canRunClaudeCliModel(): boolean {
  return isClaudeCliAvailablePlatform() && !onlineSessionActive;
}

/** Why a subscription model cannot run, for the notice; null when it can. */
export function claudeCliBlockReason(): "device" | "online" | null {
  if (!isClaudeCliAvailablePlatform()) return "device";
  return onlineSessionActive ? "online" : null;
}

/** Mirrors the Rust command's CliStatus. Never carries the account's e-mail. */
export interface ClaudeCliStatus {
  installed: boolean;
  version: string | null;
  loggedIn: boolean;
  authMethod: string | null;
  subscriptionType: string | null;
  /** "firstParty" on the claude.ai sign-in; "bedrock", "vertex"… when the CLI's own settings send it elsewhere. */
  apiProvider: string | null;
}

const NOT_INSTALLED: ClaudeCliStatus = {
  installed: false,
  version: null,
  loggedIn: false,
  authMethod: null,
  subscriptionType: null,
  apiProvider: null,
};

/** Fired on window whenever a fresh status arrives, for anything showing it. */
export const CLAUDE_CLI_STATUS_EVENT = "claude-cli-status-changed";

const STATUS_TTL_MS = 60_000;
let cachedStatus: { status: ClaudeCliStatus; at: number } | null = null;
let pendingStatus: Promise<ClaudeCliStatus> | null = null;

/** The last status read, or null before the first check finishes. */
export function getCachedClaudeCliStatus(): ClaudeCliStatus | null {
  return cachedStatus?.status ?? null;
}

/**
 * Runs `claude --version` and `claude auth status` through the desktop app
 * (cached for a minute; `force` skips the cache, for Settings' Refresh). Off
 * the desktop the answer is always "not installed".
 */
export async function getClaudeCliStatus(force = false): Promise<ClaudeCliStatus> {
  if (!isClaudeCliAvailablePlatform()) return NOT_INSTALLED;
  if (!force && cachedStatus && Date.now() - cachedStatus.at < STATUS_TTL_MS) {
    return cachedStatus.status;
  }
  if (pendingStatus) return pendingStatus;
  pendingStatus = (async () => {
    let status: ClaudeCliStatus;
    try {
      status = await invoke<ClaudeCliStatus>("claude_cli_status");
    } catch (error) {
      // A permission or command error, not a missing CLI - say so in the logs.
      logger.warn("Could not read the claude CLI's status", { error: String(error) });
      status = NOT_INSTALLED;
    }
    cachedStatus = { status, at: Date.now() };
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CLAUDE_CLI_STATUS_EVENT));
    }
    return status;
  })();
  try {
    return await pendingStatus;
  } finally {
    pendingStatus = null;
  }
}

/**
 * Whether the CLI can be used for the subscription: signed in, and not sent
 * to another API provider (Bedrock, Vertex…) by its own settings, which
 * would bill a cloud account instead of the plan (design §4.4).
 */
export function isClaudeCliUsable(status: ClaudeCliStatus | null | undefined): boolean {
  if (!status?.installed || !status.loggedIn) return false;
  return !status.apiProvider || status.apiProvider === "firstParty";
}

/** Settings' wording: "Signed in (Max)", "Not signed in", "CLI not found". */
export function describeClaudeCliStatus(status: ClaudeCliStatus | null): string {
  if (!status) return "Checking…";
  if (!status.installed) return "CLI not found";
  if (!status.loggedIn) return "Not signed in";
  if (status.apiProvider && status.apiProvider !== "firstParty") {
    return `Uses ${status.apiProvider}, not your subscription`;
  }
  const plan = status.subscriptionType
    ? status.subscriptionType.charAt(0).toUpperCase() + status.subscriptionType.slice(1)
    : null;
  return plan ? `Signed in (${plan})` : "Signed in";
}

/** For tests: forget the cached status and the online flag. */
export function resetClaudeCliStatusCache(): void {
  cachedStatus = null;
  pendingStatus = null;
  onlineSessionActive = false;
}
