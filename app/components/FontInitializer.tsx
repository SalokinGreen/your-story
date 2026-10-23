"use client";

import { useEffect } from "react";
import { applySavedTheme, initializeFonts } from "./FontSettingsTab";
import { SYNC_COMPLETED_EVENT } from "../misc/syncManager";

/**
 * Client-side component that initializes custom fonts on app load, and keeps
 * the colours in step with the saved theme: another tab changing it (a
 * `storage` event) or a sync bringing a different one in re-applies it.
 * Should be placed near the root of the app.
 */
export default function FontInitializer() {
  useEffect(() => {
    initializeFonts();

    const onStorage = (e: StorageEvent) => {
      // key is null when storage was cleared.
      if (e.key === null || e.key === "storyTheme") applySavedTheme();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SYNC_COMPLETED_EVENT, applySavedTheme);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SYNC_COMPLETED_EVENT, applySavedTheme);
    };
  }, []);

  return null;
}
