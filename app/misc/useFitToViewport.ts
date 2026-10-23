"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Height that makes an element reach from where it starts down to the bottom
 * of the visible screen, less a small gap. The debug views used a fixed
 * `100vh - 200px`, which left a band of empty space on a phone and depends on
 * how tall the header above happens to be; measuring the element's own top
 * works whatever sits above it. Re-measured on resize (rotation, the keyboard).
 */
export function useFitToViewport<T extends HTMLElement>(gap = 8, min = 240) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      setHeight(Math.max(min, Math.floor(viewport - el.getBoundingClientRect().top - gap)));
    };
    fit();
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, [gap, min]);

  return { ref, height };
}
