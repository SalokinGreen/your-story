"use client";

import { useEffect, useRef } from "react";
import {
  pushBackHandler,
  removeBackHandler,
  setRouteBack,
  clearRouteBack,
} from "@/app/misc/backStack";

/**
 * Registers `onBack` as the Android back action while `active` is true
 * (decision 133). Call it with the same function the surface already runs on
 * Escape or its close button. The entry is pushed when `active` turns true and
 * removed when it turns false or the component unmounts; the callback is read
 * through a ref, so a rerender never reorders or duplicates the entry.
 */
export function useBackHandler(active: boolean, onBack: () => void): void {
  const token = useRef<symbol>(Symbol("back"));
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });

  useEffect(() => {
    if (!active) return;
    const t = token.current;
    pushBackHandler(t, () => latest.current());
    return () => removeBackHandler(t);
  }, [active]);
}

/**
 * A page's own back, run when no surface is open. Null for none (the app is
 * then sent to the background). The latest function is always used.
 */
export function useRouteBack(fn: (() => void) | null): void {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  const has = fn !== null;

  useEffect(() => {
    if (!has) return;
    const mine = () => latest.current?.();
    setRouteBack(mine);
    return () => clearRouteBack(mine);
  }, [has]);
}
