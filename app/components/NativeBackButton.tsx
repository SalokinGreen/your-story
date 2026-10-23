"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { popBackHandler, runRouteBack } from "@/app/misc/backStack";

/**
 * Android's back button and gesture (decision 133): close whatever is open,
 * else the page's own back, else send the app to the background (never kill
 * it, so a running turn survives). Mounted once in the layout; it does
 * nothing off Android.
 */
export default function NativeBackButton() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    let cancelled = false;
    let remove: (() => void) | null = null;

    void (async () => {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("backButton", () => {
        if (popBackHandler()) return;
        if (runRouteBack()) return;
        void App.minimizeApp();
      });
      if (cancelled) void handle.remove();
      else remove = () => void handle.remove();
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  return null;
}
