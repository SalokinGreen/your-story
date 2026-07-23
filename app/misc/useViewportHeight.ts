"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Real, JS-measured viewport height in px. Some mobile browsers (in
 * particular embedded/in-app webviews) don't support the `dvh` unit and
 * fall back to a stale `100vh` that ignores the address bar/toolbar.
 * Measuring window.visualViewport (falling back to window.innerHeight) and
 * applying it as an inline style is a more reliable fix than CSS units alone.
 */
export function useViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(() =>
    typeof window === "undefined"
      ? null
      : (window.visualViewport?.height ?? window.innerHeight),
  );

  const update = useCallback(() => {
    setHeight(window.visualViewport?.height ?? window.innerHeight);
  }, []);

  useEffect(() => {
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [update]);

  return height;
}
