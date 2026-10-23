"use client";

import { useEffect, useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import {
  SyncBucket,
  SyncResult,
  clearSyncKey,
  generateSyncKey,
  getLastSyncedTimes,
  getSyncKey,
  isSyncConfigured,
  setSyncKey,
  syncAll,
} from "@/app/misc/syncManager";

interface SyncTabProps {
  addNotification: (
    message: string,
    type: "success" | "failure" | "warning"
  ) => void;
}

const BUCKET_LABELS: Record<SyncBucket, string> = {
  stories: "Stories",
  adventures: "Adventures",
  notes: "Notes",
  tables: "Tables",
  folders: "Folders",
  settings: "Settings",
};

// Counts-only fragment like "+2 ~1 -1", or null if the merge touched
// nothing (a bucket can still report "merged" after a no-op round trip).
function mergeCounts(r: SyncResult): string | null {
  const parts: string[] = [];
  if (r.added) parts.push(`+${r.added}`);
  if (r.updated) parts.push(`~${r.updated}`);
  if (r.removed) parts.push(`-${r.removed}`);
  return parts.length > 0 ? parts.join(" ") : null;
}

function describeMerge(r: SyncResult): string {
  const counts = mergeCounts(r);
  return `${BUCKET_LABELS[r.bucket]} (${counts ?? "merged"})`;
}

function summarizeResults(results: SyncResult[]): {
  message: string;
  hasError: boolean;
} {
  const errors = results.filter((r) => r.action === "error");
  const merged = results.filter((r) => r.action === "merged");
  if (errors.length > 0) {
    return {
      message: `Sync finished with ${errors.length} error(s): ${errors
        .map((e) => `${BUCKET_LABELS[e.bucket]} (${e.error})`)
        .join(", ")}`,
      hasError: true,
    };
  }
  if (merged.length === 0) {
    return { message: "Already up to date.", hasError: false };
  }
  return {
    message: `Synced: ${merged.map(describeMerge).join(", ")}`,
    hasError: false,
  };
}

export default function SyncTab({ addNotification }: SyncTabProps) {
  const [configured, setConfigured] = useState(false);
  const [syncKey, setSyncKeyState] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<
    Partial<Record<SyncBucket, string>>
  >({});
  const [lastResults, setLastResults] = useState<SyncResult[] | null>(null);
  // In-app confirmation for the destructive key actions. Previously these
  // used window.confirm(), which silently returns false (so the button does
  // nothing) inside installed-PWA standalone mode and the Capacitor/Tauri
  // native WebViews this app also ships as - see platformFetch.ts. A local
  // state flag works in every shell.
  const [pendingConfirm, setPendingConfirm] = useState<
    null | "regenerate" | "forget"
  >(null);

  useEffect(() => {
    setConfigured(isSyncConfigured());
    setSyncKeyState(getSyncKey());
    setLastSynced(getLastSyncedTimes());
  }, []);

  const performGenerate = () => {
    const key = generateSyncKey();
    setSyncKeyState(key);
    setRevealed(true);
    setLastResults(null);
    setPendingConfirm(null);
    addNotification("New sync key generated.", "success");
  };

  // First-time generation (no key yet) needs no confirmation; regenerating an
  // existing key does, since it orphans other devices until they re-link.
  const handleGenerate = () => {
    if (syncKey) {
      setPendingConfirm("regenerate");
      return;
    }
    performGenerate();
  };

  const handleLink = () => {
    const trimmed = linkInput.trim();
    if (!trimmed) return;
    setSyncKey(trimmed);
    setSyncKeyState(trimmed);
    setLinkInput("");
    setLastResults(null);
    setPendingConfirm(null);
    addNotification(
      "Sync key linked. Hit \"Sync Now\" to pull this device's data.",
      "success"
    );
  };

  const performForget = () => {
    clearSyncKey();
    setSyncKeyState(null);
    setLastResults(null);
    setPendingConfirm(null);
  };

  const handleCopy = async () => {
    if (!syncKey) return;
    try {
      await navigator.clipboard.writeText(syncKey);
      addNotification("Sync key copied.", "success");
    } catch {
      addNotification("Couldn't copy - select and copy manually.", "warning");
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const results = await syncAll();
      setLastResults(results);
      setLastSynced(getLastSyncedTimes());
      const { message, hasError } = summarizeResults(results);
      addNotification(message, hasError ? "failure" : "success");
    } catch (e) {
      addNotification(
        e instanceof Error ? e.message : "Sync failed.",
        "failure"
      );
    } finally {
      setSyncing(false);
    }
  };

  if (!configured) {
    return (
      <div className="space-y-6">
        <div className="p-4 ys-card rounded-lg space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-ys-muted">
            <DynamicIcon name="CloudOff" className="w-4 h-4" />
            Sync isn&apos;t set up for this build
          </div>
          <p className="text-xs text-ys-muted">
            This app has no account system - cross-device sync talks to a
            small, separately-hosted sync API instead. Deploy{" "}
            <code className="text-ys-accent">sync-worker/</code> and set{" "}
            <code className="text-ys-accent">
              NEXT_PUBLIC_SYNC_API_URL
            </code>{" "}
            to enable this tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-4 ys-card rounded-lg space-y-3">
        <label className="text-sm font-medium text-ys-muted flex items-center gap-2">
          <DynamicIcon name="Key" className="w-4 h-4" />
          Sync Key
        </label>
        <p className="text-xs text-ys-muted">
          Whoever has this key can read and overwrite this data - there are
          no accounts or passwords, just this key. Keep it private, and enter
          the same key on each device you want synced.
        </p>

        {syncKey ? (
          <>
            <div className="flex items-center gap-1">
              <input
                type={revealed ? "text" : "password"}
                readOnly
                value={syncKey}
                className="flex-1 px-2 py-1.5 ys-input text-xs font-mono"
              />
              <button
                onClick={() => setRevealed((r) => !r)}
                className="p-1.5 text-ys-muted hover:text-ys-text rounded-lg"
                title={revealed ? "Hide" : "Reveal"}
              >
                <DynamicIcon
                  name={revealed ? "EyeOff" : "Eye"}
                  className="w-4 h-4"
                />
              </button>
              <button
                onClick={handleCopy}
                className="p-1.5 text-ys-muted hover:text-ys-text rounded-lg"
                title="Copy"
              >
                <DynamicIcon name="Copy" className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleGenerate}
                className="text-xs text-ys-accent hover:underline"
              >
                Generate new key
              </button>
              <button
                onClick={() => setPendingConfirm("forget")}
                className="text-xs text-ys-danger hover:text-ys-danger"
              >
                Remove from this device
              </button>
            </div>
            {pendingConfirm && (
              <div className="p-3 bg-ys-warning/15 border border-ys-warning/15 rounded-lg space-y-2">
                <p className="text-xs text-ys-warning">
                  {pendingConfirm === "regenerate"
                    ? "Generate a new sync key? Any other device still using the current key will stop syncing until you re-link it with the new key."
                    : "Remove the sync key from this device? Your local data stays put, but this device will stop syncing until you link a key again."}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={
                      pendingConfirm === "regenerate"
                        ? performGenerate
                        : performForget
                    }
                    className="ys-button ys-button--danger px-3 py-1.5 text-xs font-medium rounded-lg"
                  >
                    {pendingConfirm === "regenerate"
                      ? "Generate new key"
                      : "Remove"}
                  </button>
                  <button
                    onClick={() => setPendingConfirm(null)}
                    className="ys-button px-3 py-1.5 text-xs font-medium rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <button
            onClick={handleGenerate}
            className="px-3 py-1.5 ys-button ys-button--primary text-sm font-medium rounded-lg"
          >
            Generate Sync Key
          </button>
        )}

        <div className="pt-2 border-t border-ys-border space-y-2">
          <label className="text-xs font-medium text-ys-muted">
            Link another device
          </label>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="Paste a sync key from another device..."
              className="flex-1 px-2 py-1.5 ys-input text-xs font-mono"
            />
            <button
              onClick={handleLink}
              disabled={!linkInput.trim()}
              className="ys-button px-3 py-1.5 disabled:opacity-40 text-xs font-medium rounded-lg whitespace-nowrap"
            >
              Link
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 ys-card rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-ys-muted flex items-center gap-2">
            <DynamicIcon name="RefreshCw" className="w-4 h-4" />
            Sync Now
          </label>
          <button
            onClick={handleSyncNow}
            disabled={!syncKey || syncing}
            className="px-3 py-1.5 ys-button ys-button--primary disabled:opacity-40 text-xs font-medium rounded-lg flex items-center gap-1.5"
          >
            {syncing ? (
              <>
                <DynamicIcon name="Loader2" className="w-3.5 h-3.5 animate-spin" />
                Syncing...
              </>
            ) : (
              "Sync Now"
            )}
          </button>
        </div>

        <p className="text-xs text-ys-muted">
          Sync only runs when you tap this button. Changes from different
          devices merge together item by item - creating a story on your
          phone and a different one on your laptop keeps both. Only an edit
          to the exact same item on two devices falls back to newest-wins;
          everything else (including API keys, which never leave this
          device) merges cleanly.
        </p>

        <div className="space-y-1.5">
          {(Object.keys(BUCKET_LABELS) as SyncBucket[]).map((bucket) => {
            const result = lastResults?.find((r) => r.bucket === bucket);
            return (
              <div
                key={bucket}
                className="flex items-center justify-between text-xs px-2 py-1.5 bg-ys-surface-2 rounded-md"
              >
                <span className="text-ys-muted">
                  {BUCKET_LABELS[bucket]}
                </span>
                <span
                  className={`flex items-center gap-1 ${
                    result?.action === "error"
                      ? "text-ys-danger"
                      : "text-ys-muted"
                  }`}
                >
                  {result && (
                    <DynamicIcon
                      name={
                        result.action === "error"
                          ? "AlertTriangle"
                          : result.action === "noop"
                          ? "Check"
                          : "ArrowLeftRight"
                      }
                      className="w-3 h-3"
                    />
                  )}
                  {result?.action === "error"
                    ? result.error
                    : (result?.action === "merged" && mergeCounts(result)) ||
                      (lastSynced[bucket]
                        ? `Last synced ${new Date(lastSynced[bucket]!).toLocaleString()}`
                        : "Never synced")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
