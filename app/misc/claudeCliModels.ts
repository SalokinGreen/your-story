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

/** Mirrors the Rust command's CliStatus. Never carries the account's e-mail. */
export interface ClaudeCliStatus {
  installed: boolean;
  version: string | null;
  loggedIn: boolean;
  authMethod: string | null;
  subscriptionType: string | null;
}

const NOT_INSTALLED: ClaudeCliStatus = {
  installed: false,
  version: null,
  loggedIn: false,
  authMethod: null,
  subscriptionType: null,
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
    } catch {
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

/** Settings' wording: "Signed in (Max)", "Not signed in", "CLI not found". */
export function describeClaudeCliStatus(status: ClaudeCliStatus | null): string {
  if (!status) return "Checking…";
  if (!status.installed) return "CLI not found";
  if (!status.loggedIn) return "Not signed in";
  const plan = status.subscriptionType
    ? status.subscriptionType.charAt(0).toUpperCase() + status.subscriptionType.slice(1)
    : null;
  return plan ? `Signed in (${plan})` : "Signed in";
}

/** For tests: forget the cached status. */
export function resetClaudeCliStatusCache(): void {
  cachedStatus = null;
  pendingStatus = null;
}
