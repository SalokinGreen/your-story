"use client";

import { useEffect, useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import {
  CLAUDE_CLI_STATUS_EVENT,
  ClaudeCliStatus,
  ONLINE_SESSION_EVENT,
  describeClaudeCliStatus,
  getCachedClaudeCliStatus,
  getClaudeCliStatus,
  isClaudeCliAvailablePlatform,
  isClaudeCliUsable,
  isOnlineSessionActive,
} from "@/app/misc/claudeCliModels";
import {
  REASONING_CONFIG_CHANGED_EVENT,
  SubscriptionFallback,
  getSubscriptionFallbacks,
} from "@/app/misc/reasoningTiers";
import {
  LAYER_SETTINGS_CHANGED_EVENT,
  SIDE_AGENT_DEFAULT_MODEL_KEY,
  getLayerSubscriptionFallbacks,
} from "@/app/misc/layerSettings";

/** Every slot that names a subscription model this device cannot run. */
function allFallbacks(): SubscriptionFallback[] {
  return [
    ...getSubscriptionFallbacks(),
    ...getLayerSubscriptionFallbacks().map((layer) => ({
      ...layer,
      fallbackModelKey: SIDE_AGENT_DEFAULT_MODEL_KEY,
    })),
  ];
}

/** Whether an online multiplayer session is active (decision 29), live. */
export function useOnlineSessionActive(): boolean {
  const [active, setActive] = useState(() => isOnlineSessionActive());
  useEffect(() => {
    const update = () => setActive(isOnlineSessionActive());
    window.addEventListener(ONLINE_SESSION_EVENT, update);
    update();
    return () => window.removeEventListener(ONLINE_SESSION_EVENT, update);
  }, []);
  return active;
}

/**
 * The `claude` CLI's status on this computer, checked once on mount (cached
 * for a minute by claudeCliModels.ts) and updated whenever anything re-checks
 * it. Null until the first answer; always "not installed" off the desktop.
 */
export function useClaudeCliStatus(): ClaudeCliStatus | null {
  const [status, setStatus] = useState<ClaudeCliStatus | null>(() =>
    getCachedClaudeCliStatus(),
  );
  useEffect(() => {
    if (!isClaudeCliAvailablePlatform()) return;
    const update = () => setStatus(getCachedClaudeCliStatus());
    window.addEventListener(CLAUDE_CLI_STATUS_EVENT, update);
    getClaudeCliStatus().then(setStatus);
    return () => window.removeEventListener(CLAUDE_CLI_STATUS_EVENT, update);
  }, []);
  return status;
}

/**
 * Settings' "Claude subscription" row (docs/claude-gm-design.md §4.4): the
 * CLI's status, a Refresh button and how to sign in. There is no sign-in
 * button and no credential field: sign-in happens in Anthropic's own flow,
 * in a terminal, and the app never sees it (§5.2).
 *
 * Off the desktop the row appears only when a synced setting names a
 * subscription model, to say which slots use their default here instead
 * (decision 16). On the desktop it also lists the slots that use their
 * default while an online session is active (decision 29).
 */
export default function ClaudeSubscriptionPanel() {
  const status = useClaudeCliStatus();
  const online = useOnlineSessionActive();
  const [refreshing, setRefreshing] = useState(false);
  const [fallbacks, setFallbacks] = useState<SubscriptionFallback[]>(() =>
    allFallbacks(),
  );
  const onDesktop = isClaudeCliAvailablePlatform();

  useEffect(() => {
    const update = () => setFallbacks(allFallbacks());
    window.addEventListener(REASONING_CONFIG_CHANGED_EVENT, update);
    window.addEventListener(LAYER_SETTINGS_CHANGED_EVENT, update);
    window.addEventListener(ONLINE_SESSION_EVENT, update);
    return () => {
      window.removeEventListener(REASONING_CONFIG_CHANGED_EVENT, update);
      window.removeEventListener(LAYER_SETTINGS_CHANGED_EVENT, update);
      window.removeEventListener(ONLINE_SESSION_EVENT, update);
    };
  }, []);

  if (!onDesktop && fallbacks.length === 0) return null;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await getClaudeCliStatus(true);
    } finally {
      setRefreshing(false);
    }
  };

  const signedIn = isClaudeCliUsable(status);

  return (
    <div className="p-4 ys-card rounded-lg space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-ys-text flex items-center gap-2">
          <DynamicIcon name="Sparkles" className="w-4 h-4" />
          Claude subscription
        </h4>
        {onDesktop && (
          <button
            onClick={refresh}
            disabled={refreshing}
            className="text-xs text-ys-accent hover:underline disabled:opacity-50"
          >
            {refreshing ? "Checking…" : "Refresh"}
          </button>
        )}
      </div>

      {onDesktop ? (
        <>
          <div className="flex items-center gap-3 text-xs">
            <span
              className={`flex items-center gap-1.5 ${
                signedIn ? "text-ys-success" : "text-ys-warning"
              }`}
            >
              <DynamicIcon
                name={signedIn ? "CircleCheck" : "TriangleAlert"}
                className="w-3.5 h-3.5"
              />
              {describeClaudeCliStatus(status)}
            </span>
            {status?.version && (
              <span className="text-ys-muted">CLI {status.version}</span>
            )}
          </div>
          <p className="text-xs text-ys-muted">
            Play on your own Claude plan: pick a &ldquo;(subscription)&rdquo;
            model for Default or Advanced. For those turns this app
            runs Anthropic&rsquo;s <code>claude</code> CLI on this computer. It
            never sees or stores your sign-in.
          </p>
          {status && !status.installed && (
            <p className="text-xs text-ys-muted">
              Install Anthropic&rsquo;s <code>claude</code> CLI (Claude Code)
              first, then sign in as below.
            </p>
          )}
          {status && !signedIn && (
            <p className="text-xs text-ys-muted">
              To sign in, open a terminal, run <code>claude</code>, then{" "}
              <code>/login</code>. Then press Refresh.
            </p>
          )}
          <p className="text-[11px] text-ys-muted">
            The side agents stay on their own models unless you point one at a
            subscription model under AI → Advanced settings. A turn that reaches your
            plan&rsquo;s usage limit stops with a message; it is never moved to
            a paid provider.
          </p>
          {online && (
            <div className="space-y-1">
              <p className="text-xs text-ys-warning">
                An online game is active, so subscription models are not used:
                other players&rsquo; input would run on your plan. Solo play and
                couch co-op on this computer are not affected.
              </p>
              {fallbacks.length > 0 && (
                <ul className="text-xs text-ys-muted list-disc pl-4 space-y-0.5">
                  {fallbacks.map((f) => (
                    <li key={f.slot}>
                      {f.slot} uses {f.fallbackModelKey} instead of {f.modelKey}{" "}
                      until you leave.
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-ys-warning">
            Claude subscription models run only in the desktop app. On this
            device:
          </p>
          <ul className="text-xs text-ys-muted list-disc pl-4 space-y-0.5">
            {fallbacks.map((f) => (
              <li key={f.slot}>
                {f.slot} uses {f.fallbackModelKey} instead of {f.modelKey}.
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
