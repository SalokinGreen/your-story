"use client";

// Settings → Game: the one place that sends app feedback from Settings, and
// the device-only switch for the after-a-night card (design §6, decision 192).
// Shown only when this build knows the Worker's address.

import { useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import { feedbackAvailable } from "../misc/feedbackClient";
import { openFeedback } from "../misc/feedbackLauncher";
import { isOnlineSessionActive } from "../misc/claudeCliModels";
import { afterNightEnabled, setAfterNightEnabled } from "../misc/feedbackSession";

export default function FeedbackSettingsSection() {
  // Read when the Game tab opens (Settings mounts after the page has, so
  // localStorage is there); not an effect, which would set state on mount.
  const [afterNight, setAfterNight] = useState(() => afterNightEnabled());
  // Settings cannot tell a guest from a host, so any online session hides the
  // button (the story menu still offers the host one).
  const [online] = useState(() => isOnlineSessionActive());

  if (!feedbackAvailable()) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-ys-text flex items-center gap-2">
        <DynamicIcon name="MessageSquare" className="w-4 h-4" />
        Feedback
      </h3>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-ys-text">Ask for feedback after a night</p>
          <p className="text-xs text-ys-muted">
            Shows a small &ldquo;How was tonight?&rdquo; line when the GM ends a night. This
            device only; it is never synced.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={afterNight}
            aria-label="Ask for feedback after a night"
            onChange={(e) => {
              setAfterNight(e.target.checked);
              setAfterNightEnabled(e.target.checked);
            }}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-ys-border peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ys-accent rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-ys-border after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-ys-bg after:border-ys-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ys-accent" />
        </label>
      </div>
      {!online && (
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-ys-muted">
          Feedback goes to the developer, who can read it. It is optional and never sent unless you
          press Send.
        </p>
        <button
          type="button"
          onClick={() => openFeedback({ kind: "app", target: "app" })}
          className="ys-button ys-button--ghost px-3 py-2 text-sm shrink-0"
        >
          Send feedback
        </button>
      </div>
      )}
    </div>
  );
}
