/**
 * Opens a URL in a real browser, outside the app's own webview.
 *
 * Desktop (Tauri) goes through the opener plugin, which hands the URL to the
 * system's default browser (allowed for https:// only - see
 * src-tauri/capabilities/default.json). Mobile (Capacitor) uses the Browser
 * plugin's in-app browser tab (SFSafariViewController / Chrome Custom Tabs),
 * which shares the system browser's sign-ins. The web build just opens a tab.
 *
 * The plugins are imported lazily so the web bundle never loads them.
 */

import { isTauri } from "@tauri-apps/api/core";

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }

  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
